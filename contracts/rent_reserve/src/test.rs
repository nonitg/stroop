#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, IssuerFlags, Ledger};
use soroban_sdk::token::{StellarAssetClient, TokenClient};

const RENT: i128 = 1_000_0000000; // 1,000 USDC (7 decimals)
const TOTAL: i128 = RENT * 12;
const FEE: i128 = TOTAL / 100; // 1%
const MONTH: u64 = 60;
const WINDOW: u64 = 600;

struct Setup<'a> {
    env: Env,
    client: RentReserveClient<'a>,
    usdc: TokenClient<'a>,
    usdc_admin: StellarAssetClient<'a>,
    payer: Address,
    landlord: Address,
    mediator: Address,
    treasury: Address,
    vault: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    sac.issuer().set_flag(IssuerFlags::RevocableFlag);
    let usdc = TokenClient::new(&env, &sac.address());
    let usdc_admin = StellarAssetClient::new(&env, &sac.address());

    let payer = Address::generate(&env);
    let landlord = Address::generate(&env);
    let mediator = Address::generate(&env);
    let treasury = Address::generate(&env);
    usdc_admin.mint(&payer, &(TOTAL + FEE));

    let vault = env.register(demo_vault::DemoVault, (&sac.address(), &treasury));
    let id = env.register(RentReserve, (&sac.address(), &treasury, &100u32, &50u32, &vault));
    let client = RentReserveClient::new(&env, &id);
    Setup { env, client, usdc, usdc_admin, payer, landlord, mediator, treasury, vault }
}

fn err(e: Error) -> soroban_sdk::Error {
    e.into()
}

fn advance(env: &Env, secs: u64) {
    env.ledger().with_mut(|l| l.timestamp += secs);
}

fn new_lease(s: &Setup) -> u64 {
    s.client.create(&s.payer, &s.landlord, &s.mediator, &RENT, &12, &MONTH, &WINDOW, &false)
}

fn active_lease(s: &Setup) -> u64 {
    let id = new_lease(s);
    s.client.accept(&id);
    s.client.move_in(&id);
    id
}

#[test]
fn full_lease_pays_monthly_collects_fee_then_completes() {
    let s = setup();
    let id = new_lease(&s);
    assert_eq!(s.usdc.balance(&s.client.address), TOTAL + FEE);

    s.client.accept(&id);
    s.client.move_in(&id);
    assert_eq!(s.usdc.balance(&s.landlord), RENT);
    assert_eq!(s.usdc.balance(&s.treasury), FEE);

    advance(&s.env, MONTH * 2);
    assert_eq!(s.client.release(&id), RENT * 2);
    assert_eq!(s.client.get_lease(&id).paid_periods, 3);

    advance(&s.env, MONTH * 20);
    s.client.release(&id);
    let lease = s.client.get_lease(&id);
    assert_eq!(lease.status, Status::Completed);
    assert_eq!(lease.held, 0);
    assert_eq!(s.usdc.balance(&s.landlord), TOTAL);
    assert_eq!(s.usdc.balance(&s.client.address), 0);
}

#[test]
fn rent_cannot_be_released_early_or_twice() {
    let s = setup();
    let id = active_lease(&s);
    assert_eq!(s.client.try_release(&id), Err(Ok(err(Error::NothingDue))));

    advance(&s.env, MONTH);
    s.client.release(&id);
    assert_eq!(s.client.try_release(&id), Err(Ok(err(Error::NothingDue))));
    assert_eq!(s.usdc.balance(&s.landlord), RENT * 2);
}

#[test]
fn early_end_needs_both_parties_before_proposal_lapses() {
    let s = setup();
    let id = active_lease(&s);

    let stranger = Address::generate(&s.env);
    assert_eq!(s.client.try_end_early(&id, &stranger), Err(Ok(err(Error::NotAParty))));

    // A proposal the other side ignores lapses; agreeing later only re-proposes.
    assert_eq!(s.client.end_early(&id, &s.landlord), 0);
    advance(&s.env, MONTH + 1);
    assert_eq!(s.client.end_early(&id, &s.payer), 0);
    assert_eq!(s.client.get_lease(&id).status, Status::Active);

    // Fresh proposal by the payer, agreed in time by the landlord.
    assert_eq!(s.client.end_early(&id, &s.landlord), RENT * 10);
    let lease = s.client.get_lease(&id);
    assert_eq!(lease.status, Status::Ended);
    assert_eq!(s.usdc.balance(&s.landlord), RENT * 2);
    assert_eq!(s.usdc.balance(&s.payer), RENT * 10);
}

#[test]
fn proposer_can_withdraw_early_end() {
    let s = setup();
    let id = active_lease(&s);
    s.client.end_early(&id, &s.landlord);
    assert_eq!(s.client.try_cancel_end(&id, &s.payer), Err(Ok(err(Error::NotProposer))));
    s.client.cancel_end(&id, &s.landlord);
    // With the proposal withdrawn, the payer's call is a new proposal, not an agreement.
    assert_eq!(s.client.end_early(&id, &s.payer), 0);
    assert_eq!(s.client.get_lease(&id).status, Status::Active);
}

#[test]
fn ending_after_full_term_reports_completed() {
    let s = setup();
    let id = active_lease(&s);
    // Every month is due by the time both sides agree, so nothing is refunded.
    advance(&s.env, MONTH * 12);
    s.client.end_early(&id, &s.landlord);
    assert_eq!(s.client.end_early(&id, &s.payer), 0);
    assert_eq!(s.client.get_lease(&id).status, Status::Completed);
    assert_eq!(s.usdc.balance(&s.landlord), TOTAL);
}

#[test]
fn payer_reclaims_everything_when_listing_never_materializes() {
    let s = setup();
    let id = new_lease(&s);
    s.client.accept(&id);
    assert_eq!(s.client.try_reclaim(&id), Err(Ok(err(Error::MoveInWindowOpen))));

    advance(&s.env, WINDOW + 1);
    assert_eq!(s.client.try_move_in(&id), Err(Ok(err(Error::MoveInWindowClosed))));
    assert_eq!(s.client.reclaim(&id), TOTAL + FEE);
    assert_eq!(s.usdc.balance(&s.payer), TOTAL + FEE);
    assert_eq!(s.usdc.balance(&s.treasury), 0);
    assert_eq!(s.client.get_lease(&id).status, Status::Refunded);
}

#[test]
fn payer_can_cancel_before_landlord_accepts() {
    let s = setup();
    let id = new_lease(&s);
    assert_eq!(s.client.reclaim(&id), TOTAL + FEE);
    assert_eq!(s.client.try_accept(&id), Err(Ok(err(Error::WrongStatus))));
}

#[test]
fn handed_over_keys_start_the_lease_unless_disputed() {
    let s = setup();
    let id = new_lease(&s);
    s.client.accept(&id);
    s.client.hand_over(&id);

    // The payer can't walk away with the reserve after getting the keys...
    advance(&s.env, WINDOW + 1);
    assert_eq!(s.client.try_reclaim(&id), Err(Ok(err(Error::KeysHandedOver))));
    // ...and once the dispute window passes quietly, anyone can start the lease.
    let paid = s.client.release(&id);
    assert!(paid >= RENT);
    let lease = s.client.get_lease(&id);
    assert_eq!(lease.status, Status::Active);
    assert_eq!(lease.start, 1_000);
    assert_eq!(s.usdc.balance(&s.treasury), FEE);
}

#[test]
fn handover_cannot_be_forced_before_dispute_window_ends() {
    let s = setup();
    let id = new_lease(&s);
    s.client.accept(&id);
    s.client.hand_over(&id);
    assert_eq!(s.client.try_release(&id), Err(Ok(err(Error::NothingDue))));
}

#[test]
fn dispute_pauses_payouts_and_mediator_splits_funds() {
    let s = setup();
    let id = new_lease(&s);
    s.client.accept(&id);
    s.client.hand_over(&id);
    s.client.dispute(&id, &s.payer);
    advance(&s.env, MONTH * 3);
    assert_eq!(s.client.try_release(&id), Err(Ok(err(Error::WrongStatus))));

    assert_eq!(s.client.try_resolve(&id, &(TOTAL + 1)), Err(Ok(err(Error::InvalidAmount))));
    s.client.resolve(&id, &RENT);
    assert_eq!(s.env.auths()[0].0, s.mediator);
    // Never moved in, so the fee goes back to the payer too.
    assert_eq!(s.usdc.balance(&s.landlord), RENT);
    assert_eq!(s.usdc.balance(&s.payer), TOTAL - RENT + FEE);
    assert_eq!(s.usdc.balance(&s.treasury), 0);
    assert_eq!(s.usdc.balance(&s.client.address), 0);
    assert_eq!(s.client.get_lease(&id).status, Status::Ended);
}

#[test]
fn mediator_cannot_act_without_a_dispute() {
    let s = setup();
    let id = new_lease(&s);
    assert_eq!(s.client.try_resolve(&id, &TOTAL), Err(Ok(err(Error::WrongStatus))));
    s.client.accept(&id);
    s.client.move_in(&id);
    assert_eq!(s.client.try_resolve(&id, &RENT), Err(Ok(err(Error::WrongStatus))));
}

#[test]
fn landlord_who_cannot_receive_never_blocks_refund() {
    let s = setup();
    let id = active_lease(&s);
    s.usdc_admin.set_authorized(&s.landlord, &false);

    advance(&s.env, MONTH);
    s.client.end_early(&id, &s.landlord);
    assert_eq!(s.client.end_early(&id, &s.payer), RENT * 10);
    let lease = s.client.get_lease(&id);
    assert_eq!(lease.landlord_owed, RENT);
    assert_eq!(s.usdc.balance(&s.payer), RENT * 10);

    s.usdc_admin.set_authorized(&s.landlord, &true);
    assert_eq!(s.client.claim(&id), RENT);
    assert_eq!(s.usdc.balance(&s.landlord), RENT * 2);
    assert_eq!(s.usdc.balance(&s.client.address), 0);
}

#[test]
fn actions_require_the_right_signer() {
    let s = setup();
    let id = new_lease(&s);

    s.client.accept(&id);
    assert_eq!(s.env.auths()[0].0, s.landlord);
    s.client.hand_over(&id);
    assert_eq!(s.env.auths()[0].0, s.landlord);
    s.client.move_in(&id);
    assert_eq!(s.env.auths()[0].0, s.payer);
}

#[test]
#[should_panic]
fn stranger_cannot_accept() {
    let s = setup();
    let id = new_lease(&s);
    s.env.set_auths(&[]);
    s.client.accept(&id);
}

#[test]
fn rejects_bad_terms() {
    let s = setup();
    let c = &s.client;
    let cases = [
        (s.payer.clone(), s.mediator.clone(), RENT, 12u32, MONTH, WINDOW), // landlord == payer
        (s.landlord.clone(), s.payer.clone(), RENT, 12, MONTH, WINDOW),    // mediator == payer
        (s.landlord.clone(), s.mediator.clone(), 0, 12, MONTH, WINDOW),    // zero rent
        (s.landlord.clone(), s.mediator.clone(), RENT, 25, MONTH, WINDOW), // too many months
        (s.landlord.clone(), s.mediator.clone(), RENT, 12, u64::MAX, WINDOW), // unbounded period
        (s.landlord.clone(), s.mediator.clone(), RENT, 12, MONTH, 0),      // no move-in window
    ];
    for (landlord, mediator, rent, periods, period, window) in cases {
        assert_eq!(
            c.try_create(&s.payer, &landlord, &mediator, &rent, &periods, &period, &window, &false),
            Err(Ok(err(Error::InvalidTerms)))
        );
    }
}

#[test]
#[should_panic]
fn rejects_excessive_fee_config() {
    let env = Env::default();
    let token = Address::generate(&env);
    let treasury = Address::generate(&env);
    env.register(RentReserve, (&token, &treasury, &(MAX_FEE_BPS + 1), &0u32, &token));
}

// --- Lending -------------------------------------------------------------

const LEND_FEE: i128 = TOTAL / 200; // 0.5%

fn vault(s: &Setup) -> demo_vault::DemoVaultClient<'static> {
    demo_vault::DemoVaultClient::new(&s.env, &s.vault)
}

/// Lending lease that has moved in, with `cover` in the cover fund.
fn lending_lease(s: &Setup, cover: i128) -> u64 {
    if cover > 0 {
        s.usdc_admin.mint(&s.treasury, &cover);
        s.client.add_cover(&s.treasury, &cover);
    }
    let id = s.client.create(&s.payer, &s.landlord, &s.mediator, &RENT, &12, &MONTH, &WINDOW, &true);
    s.client.accept(&id);
    s.client.move_in(&id);
    id
}

#[test]
fn lending_keeps_three_months_in_cash_and_pays_every_month() {
    let s = setup();
    let id = lending_lease(&s, 1_000 * RENT);
    // Month 1 paid; months 2-4 stay in cash; months 5-12 are lent.
    let l = s.client.get_lease(&id);
    assert_eq!(l.fee, LEND_FEE);
    assert_eq!(l.lent, RENT * 8);
    assert_eq!(vault(&s).owed(&s.client.address), RENT * 8);
    assert_eq!(s.client.cover_status(), (1_000 * RENT, RENT * 8));

    advance(&s.env, MONTH);
    s.client.release(&id);
    assert_eq!(s.client.get_lease(&id).lent, RENT * 7);

    advance(&s.env, MONTH * 20);
    s.client.release(&id);
    let l = s.client.get_lease(&id);
    assert_eq!(l.status, Status::Completed);
    assert_eq!((l.held, l.lent), (0, 0));
    assert_eq!(s.usdc.balance(&s.landlord), TOTAL);
    assert_eq!(s.client.cover_status(), (1_000 * RENT, 0));
}

#[test]
fn cover_fund_makes_up_a_lending_loss() {
    let s = setup();
    let id = lending_lease(&s, 2 * RENT);
    vault(&s).simulate_loss(&(RENT + RENT / 2));

    advance(&s.env, MONTH * 20);
    s.client.release(&id);
    let l = s.client.get_lease(&id);
    assert_eq!(l.status, Status::Completed);
    assert_eq!(l.covered, RENT + RENT / 2);
    assert_eq!(s.usdc.balance(&s.landlord), TOTAL);
    assert_eq!(s.client.cover_status(), (RENT / 2, 0));
}

#[test]
fn lending_never_exceeds_what_cover_can_back() {
    let s = setup();
    let id = lending_lease(&s, 0);
    assert_eq!(s.client.get_lease(&id).lent, 0);

    // 10% cover backs 10x its size.
    s.usdc_admin.mint(&s.treasury, &(RENT / 2));
    s.client.add_cover(&s.treasury, &(RENT / 2));
    s.client.rebalance(&id);
    assert_eq!(s.client.get_lease(&id).lent, RENT * 5);
}

#[test]
fn payer_can_switch_lending_off_and_end_early_refunds_lent_rent() {
    let s = setup();
    let id = lending_lease(&s, 1_000 * RENT);
    s.client.set_lending(&id, &false);
    assert_eq!(s.client.get_lease(&id).lent, 0);
    assert_eq!(vault(&s).owed(&s.client.address), 0);

    s.client.set_lending(&id, &true);
    assert_eq!(s.client.get_lease(&id).lent, RENT * 8);
    s.client.end_early(&id, &s.payer);
    assert_eq!(s.client.end_early(&id, &s.landlord), RENT * 11);
    assert_eq!(s.client.get_lease(&id).lent, 0);
}

#[test]
fn treasury_cannot_pull_cover_below_ten_percent_of_lent_rent() {
    let s = setup();
    lending_lease(&s, RENT);
    assert_eq!(s.client.cover_status(), (RENT, RENT * 8));
    assert_eq!(s.client.try_take_cover(&(RENT / 5 + 1)), Err(Ok(err(Error::CoverTooLow))));
    s.client.take_cover(&(RENT / 5));
}

#[test]
fn mediator_split_recalls_lent_rent_first() {
    let s = setup();
    let id = lending_lease(&s, 1_000 * RENT);
    s.client.dispute(&id, &s.payer);
    s.client.resolve(&id, &(RENT * 3));
    assert_eq!(s.usdc.balance(&s.landlord), RENT * 4);
    // Minted with the regular fee; the lending fee is half, so the rest stays with the payer.
    assert_eq!(s.usdc.balance(&s.payer), RENT * 8 + FEE - LEND_FEE);
    assert_eq!(s.client.cover_status(), (1_000 * RENT, 0));
}
