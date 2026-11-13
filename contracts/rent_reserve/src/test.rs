#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::token::{StellarAssetClient, TokenClient};

const RENT: i128 = 1_000_0000000; // 1,000 USDC (7 decimals)
const MONTH: u64 = 60;
const WINDOW: u64 = 600;

struct Setup<'a> {
    env: Env,
    client: RentReserveClient<'a>,
    usdc: TokenClient<'a>,
    payer: Address,
    landlord: Address,
    resolver: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let usdc = TokenClient::new(&env, &sac.address());

    let payer = Address::generate(&env);
    let landlord = Address::generate(&env);
    let resolver = Address::generate(&env);
    StellarAssetClient::new(&env, &sac.address()).mint(&payer, &(RENT * 12));

    let id = env.register(RentReserve, (&resolver,));
    let client = RentReserveClient::new(&env, &id);
    Setup { env, client, usdc, payer, landlord, resolver }
}

fn err(e: Error) -> soroban_sdk::Error {
    e.into()
}

fn advance(env: &Env, secs: u64) {
    env.ledger().with_mut(|l| l.timestamp += secs);
}

fn new_lease(s: &Setup) -> u64 {
    s.client.create(&s.payer, &s.landlord, &s.usdc.address, &RENT, &12, &MONTH, &WINDOW)
}

#[test]
fn full_lease_pays_monthly_then_completes() {
    let s = setup();
    let id = new_lease(&s);
    assert_eq!(s.usdc.balance(&s.client.address), RENT * 12);

    s.client.accept(&id);
    s.client.move_in(&id);
    assert_eq!(s.usdc.balance(&s.landlord), RENT);

    advance(&s.env, MONTH * 2);
    assert_eq!(s.client.release(&id), RENT * 2);
    assert_eq!(s.client.get_lease(&id).paid_periods, 3);

    advance(&s.env, MONTH * 20);
    s.client.release(&id);
    let lease = s.client.get_lease(&id);
    assert_eq!(lease.status, Status::Completed);
    assert_eq!(lease.held, 0);
    assert_eq!(s.usdc.balance(&s.landlord), RENT * 12);
}

#[test]
fn rent_cannot_be_released_early_or_twice() {
    let s = setup();
    let id = new_lease(&s);
    s.client.accept(&id);
    s.client.move_in(&id);
    assert_eq!(s.client.try_release(&id), Err(Ok(err(Error::NothingDue))));

    advance(&s.env, MONTH);
    s.client.release(&id);
    assert_eq!(s.client.try_release(&id), Err(Ok(err(Error::NothingDue))));
    assert_eq!(s.usdc.balance(&s.landlord), RENT * 2);
}

#[test]
fn only_parties_can_end_and_both_must_agree() {
    let s = setup();
    let id = new_lease(&s);
    s.client.accept(&id);
    s.client.move_in(&id);

    let stranger = Address::generate(&s.env);
    assert_eq!(s.client.try_end_early(&id, &stranger), Err(Ok(err(Error::NotAParty))));

    advance(&s.env, MONTH);
    assert_eq!(s.client.end_early(&id, &s.landlord), 0);
    // Proposing twice from the same side does not settle.
    assert_eq!(s.client.end_early(&id, &s.landlord), 0);
    assert_eq!(s.client.end_early(&id, &s.payer), RENT * 10);

    let lease = s.client.get_lease(&id);
    assert_eq!(lease.status, Status::Ended);
    assert_eq!(s.usdc.balance(&s.landlord), RENT * 2);
    assert_eq!(s.usdc.balance(&s.payer), RENT * 10);
}

#[test]
fn payer_reclaims_when_listing_never_materializes() {
    let s = setup();
    let id = new_lease(&s);
    s.client.accept(&id);
    // Landlord accepted, but keys never handed over: payer must wait out the window.
    assert_eq!(s.client.try_reclaim(&id), Err(Ok(err(Error::MoveInWindowOpen))));

    advance(&s.env, WINDOW + 1);
    assert_eq!(s.client.try_move_in(&id), Err(Ok(err(Error::MoveInWindowClosed))));
    assert_eq!(s.client.reclaim(&id), RENT * 12);
    assert_eq!(s.usdc.balance(&s.payer), RENT * 12);
    assert_eq!(s.client.get_lease(&id).status, Status::Refunded);
}

#[test]
fn payer_can_cancel_before_landlord_accepts() {
    let s = setup();
    let id = new_lease(&s);
    assert_eq!(s.client.reclaim(&id), RENT * 12);
    assert_eq!(s.client.try_accept(&id), Err(Ok(err(Error::WrongStatus))));
}

#[test]
fn actions_require_the_right_signer() {
    let s = setup();
    let id = new_lease(&s);

    s.client.accept(&id);
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.landlord);

    s.client.move_in(&id);
    assert_eq!(s.env.auths()[0].0, s.payer);
}

#[test]
fn resolver_can_only_split_between_parties() {
    let s = setup();
    let id = new_lease(&s);
    s.client.accept(&id);
    s.client.move_in(&id);

    assert_eq!(
        s.client.try_resolve(&id, &(RENT * 12)),
        Err(Ok(err(Error::InvalidAmount)))
    );
    s.client.resolve(&id, &(RENT / 2));
    assert_eq!(s.env.auths()[0].0, s.resolver);
    assert_eq!(s.usdc.balance(&s.landlord), RENT + RENT / 2);
    assert_eq!(s.usdc.balance(&s.payer), RENT * 11 - RENT / 2);
    assert_eq!(s.usdc.balance(&s.client.address), 0);
}

#[test]
fn rejects_bad_terms() {
    let s = setup();
    assert_eq!(
        s.client.try_create(&s.payer, &s.payer, &s.usdc.address, &RENT, &12, &MONTH, &WINDOW),
        Err(Ok(err(Error::InvalidTerms)))
    );
    assert_eq!(
        s.client.try_create(&s.payer, &s.landlord, &s.usdc.address, &0, &12, &MONTH, &WINDOW),
        Err(Ok(err(Error::InvalidTerms)))
    );
}
