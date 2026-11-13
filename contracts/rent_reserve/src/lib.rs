#![no_std]
//! RentProof rent reserve.
//!
//! A newcomer (or their family) locks a lease's rent in this contract instead of
//! wiring months of cash to a landlord. The landlord can verify the locked funds
//! on-chain, rent is released one period at a time, and money not yet owed is
//! refunded under rules both sides agreed to up front. Nobody, including the
//! operator, can send a lease's money anywhere except to its landlord or back to
//! its payer.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env,
};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Status {
    /// Funds locked; waiting for the landlord to accept the lease.
    Funded = 0,
    /// Landlord accepted; waiting for move-in.
    Accepted = 1,
    /// Moved in; rent releases each period.
    Active = 2,
    /// Every period was paid to the landlord.
    Completed = 3,
    /// Ended early (mutual agreement or mediator); unused rent refunded.
    Ended = 4,
    /// Never moved in; full reserve and fee returned to the payer.
    Refunded = 5,
    /// A party raised a dispute; payouts pause until the mediator settles it.
    Disputed = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Lease {
    /// Student or family wallet that funds the reserve and receives refunds.
    pub payer: Address,
    pub landlord: Address,
    /// Neutral party named by the payer and accepted by the landlord. Can only
    /// split a disputed lease's funds between payer and landlord.
    pub mediator: Address,
    /// Rent per period, in token base units.
    pub rent: i128,
    pub periods: u32,
    /// Length of one rent period (30 days in production; a minute in demos).
    pub period_secs: u64,
    pub created_at: u64,
    /// Keys must be handed over or move-in confirmed by this time, or the payer may reclaim everything.
    pub move_in_by: u64,
    /// When the landlord marked the keys as handed over; 0 if not yet.
    pub handed_over_at: u64,
    /// When the lease started; 0 until move-in.
    pub start: u64,
    pub paid_periods: u32,
    /// Rent still locked for this lease.
    pub held: i128,
    /// Service fee, paid to the operator at move-in and refunded if move-in never happens.
    pub fee: i128,
    /// Rent the landlord is owed but couldn't receive (e.g. a missing trustline); claimable.
    pub landlord_owed: i128,
    pub status: Status,
    /// Party that proposed ending early, and when; the other party must agree before it expires.
    pub end_proposed_by: Option<Address>,
    pub end_proposed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    /// The only token leases can be funded with (USDC).
    pub token: Address,
    /// Receives service fees.
    pub treasury: Address,
    /// Service fee in basis points of the reserve.
    pub fee_bps: u32,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidConfig = 1,
    InvalidTerms = 2,
    LeaseNotFound = 3,
    WrongStatus = 4,
    NotAParty = 5,
    NothingDue = 6,
    MoveInWindowOpen = 7,
    MoveInWindowClosed = 8,
    InvalidAmount = 9,
    KeysHandedOver = 10,
    NotProposer = 11,
}

#[contracttype]
enum DataKey {
    Config,
    Count,
    Lease(u64),
}

const MAX_PERIODS: u32 = 24;
const MIN_PERIOD_SECS: u64 = 60;
const MAX_PERIOD_SECS: u64 = 31 * 24 * 3600;
const MIN_WINDOW_SECS: u64 = 60;
const MAX_WINDOW_SECS: u64 = 90 * 24 * 3600;
const MAX_FEE_BPS: u32 = 500;
/// Time the payer has to dispute after the landlord marks the keys handed over.
const MAX_DISPUTE_WINDOW_SECS: u64 = 3 * 24 * 3600;
/// An early-end proposal lapses if the other party doesn't agree within this time.
const MAX_PROPOSAL_SECS: u64 = 7 * 24 * 3600;
// Keep records alive for months of ledgers on every touch (the host caps the maximum).
const TTL_THRESHOLD: u32 = 500_000;
const TTL_EXTEND: u32 = 3_000_000;

#[contractevent(topics = ["funded"])]
pub struct Funded {
    #[topic]
    pub id: u64,
    pub payer: Address,
    pub landlord: Address,
    pub mediator: Address,
    pub token: Address,
    pub amount: i128,
    pub fee: i128,
}

#[contractevent(topics = ["accepted"])]
pub struct Accepted {
    #[topic]
    pub id: u64,
}

#[contractevent(topics = ["handed_over"])]
pub struct HandedOver {
    #[topic]
    pub id: u64,
    pub dispute_until: u64,
}

#[contractevent(topics = ["moved_in"])]
pub struct MovedIn {
    #[topic]
    pub id: u64,
    pub start: u64,
}

#[contractevent(topics = ["fee_collected"])]
pub struct FeeCollected {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

#[contractevent(topics = ["rent_paid"])]
pub struct RentPaid {
    #[topic]
    pub id: u64,
    pub periods_paid: u32,
    pub amount: i128,
}

#[contractevent(topics = ["completed"])]
pub struct Completed {
    #[topic]
    pub id: u64,
}

#[contractevent(topics = ["refunded"])]
pub struct Refunded {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

#[contractevent(topics = ["end_proposed"])]
pub struct EndProposed {
    #[topic]
    pub id: u64,
    pub by: Address,
    pub expires_at: u64,
}

#[contractevent(topics = ["end_cancelled"])]
pub struct EndCancelled {
    #[topic]
    pub id: u64,
}

#[contractevent(topics = ["ended"])]
pub struct Ended {
    #[topic]
    pub id: u64,
    pub refunded: i128,
}

#[contractevent(topics = ["disputed"])]
pub struct Disputed {
    #[topic]
    pub id: u64,
    pub by: Address,
}

#[contractevent(topics = ["resolved"])]
pub struct Resolved {
    #[topic]
    pub id: u64,
    pub to_landlord: i128,
    pub to_payer: i128,
}

#[contractevent(topics = ["claimed"])]
pub struct Claimed {
    #[topic]
    pub id: u64,
    pub amount: i128,
}

#[contract]
pub struct RentReserve;

#[contractimpl]
impl RentReserve {
    /// `token` is fixed for the contract's life so a lease can never be "funded"
    /// with a look-alike token.
    pub fn __constructor(env: Env, token: Address, treasury: Address, fee_bps: u32) {
        if fee_bps > MAX_FEE_BPS {
            panic_with_error!(&env, Error::InvalidConfig);
        }
        env.storage().instance().set(&DataKey::Config, &Config { token, treasury, fee_bps });
        env.storage().instance().set(&DataKey::Count, &0u64);
    }

    /// Lock `rent * periods` (plus the service fee) from `payer` for a new lease.
    /// Returns the lease id.
    pub fn create(
        env: Env,
        payer: Address,
        landlord: Address,
        mediator: Address,
        rent: i128,
        periods: u32,
        period_secs: u64,
        move_in_window_secs: u64,
    ) -> u64 {
        payer.require_auth();
        let valid = rent > 0
            && (1..=MAX_PERIODS).contains(&periods)
            && (MIN_PERIOD_SECS..=MAX_PERIOD_SECS).contains(&period_secs)
            && (MIN_WINDOW_SECS..=MAX_WINDOW_SECS).contains(&move_in_window_secs)
            && payer != landlord
            && mediator != payer
            && mediator != landlord;
        if !valid {
            panic_with_error!(&env, Error::InvalidTerms);
        }
        let cfg = config(&env);
        let total = rent
            .checked_mul(periods as i128)
            .unwrap_or_else(|| panic_with_error!(&env, Error::InvalidTerms));
        let fee = total
            .checked_mul(cfg.fee_bps as i128)
            .unwrap_or_else(|| panic_with_error!(&env, Error::InvalidTerms))
            / 10_000;

        token::Client::new(&env, &cfg.token).transfer(
            &payer,
            &env.current_contract_address(),
            &(total + fee),
        );

        let id: u64 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        env.storage().instance().set(&DataKey::Count, &(id + 1));

        let now = env.ledger().timestamp();
        let lease = Lease {
            payer: payer.clone(),
            landlord: landlord.clone(),
            mediator: mediator.clone(),
            rent,
            periods,
            period_secs,
            created_at: now,
            move_in_by: now + move_in_window_secs,
            handed_over_at: 0,
            start: 0,
            paid_periods: 0,
            held: total,
            fee,
            landlord_owed: 0,
            status: Status::Funded,
            end_proposed_by: None,
            end_proposed_at: 0,
        };
        save(&env, id, &lease);
        Funded { id, payer, landlord, mediator, token: cfg.token, amount: total, fee }.publish(&env);
        id
    }

    /// Landlord commits to the lease terms and mediator. Until then the payer can cancel freely.
    pub fn accept(env: Env, id: u64) {
        let mut lease = load(&env, id);
        lease.landlord.require_auth();
        require_status(&env, &lease, Status::Funded);
        if env.ledger().timestamp() > lease.move_in_by {
            panic_with_error!(&env, Error::MoveInWindowClosed);
        }
        lease.status = Status::Accepted;
        save(&env, id, &lease);
        Accepted { id }.publish(&env);
    }

    /// Landlord records that the keys were handed over. The payer can then no longer
    /// reclaim the reserve; if they don't confirm move-in or dispute within the
    /// dispute window, the lease starts on its own.
    pub fn hand_over(env: Env, id: u64) {
        let mut lease = load(&env, id);
        lease.landlord.require_auth();
        require_status(&env, &lease, Status::Accepted);
        let now = env.ledger().timestamp();
        if lease.handed_over_at != 0 {
            panic_with_error!(&env, Error::KeysHandedOver);
        }
        if now > lease.move_in_by {
            panic_with_error!(&env, Error::MoveInWindowClosed);
        }
        lease.handed_over_at = now;
        save(&env, id, &lease);
        HandedOver { id, dispute_until: now + dispute_window(&lease) }.publish(&env);
    }

    /// Student confirms they have the keys. Starts the schedule, pays month one and
    /// collects the service fee.
    pub fn move_in(env: Env, id: u64) {
        let mut lease = load(&env, id);
        lease.payer.require_auth();
        require_status(&env, &lease, Status::Accepted);
        let now = env.ledger().timestamp();
        if now > lease.move_in_by && lease.handed_over_at == 0 {
            panic_with_error!(&env, Error::MoveInWindowClosed);
        }
        activate(&env, id, &mut lease, now);
        save(&env, id, &lease);
    }

    /// Pay the landlord every period that has come due. Anyone may call this (a
    /// keeper does on rent day): the money can only ever go to the landlord, and
    /// never ahead of schedule. Also starts a lease whose keys were handed over and
    /// whose dispute window passed quietly. Returns the amount paid.
    pub fn release(env: Env, id: u64) -> i128 {
        let mut lease = load(&env, id);
        let now = env.ledger().timestamp();
        let paid = if lease.status == Status::Accepted && lease.handed_over_at != 0 {
            if now < lease.handed_over_at + dispute_window(&lease) {
                panic_with_error!(&env, Error::NothingDue);
            }
            let start = lease.handed_over_at;
            activate(&env, id, &mut lease, start)
        } else {
            require_status(&env, &lease, Status::Active);
            pay_due(&env, id, &mut lease)
        };
        if paid == 0 {
            panic_with_error!(&env, Error::NothingDue);
        }
        save(&env, id, &lease);
        paid
    }

    /// Payer gets the full reserve and fee back if the landlord never accepted, or if
    /// the move-in deadline passed without the keys being handed over (e.g. a fake listing).
    pub fn reclaim(env: Env, id: u64) -> i128 {
        let mut lease = load(&env, id);
        lease.payer.require_auth();
        match lease.status {
            Status::Funded => {}
            Status::Accepted => {
                if lease.handed_over_at != 0 {
                    panic_with_error!(&env, Error::KeysHandedOver);
                }
                if env.ledger().timestamp() <= lease.move_in_by {
                    panic_with_error!(&env, Error::MoveInWindowOpen);
                }
            }
            _ => panic_with_error!(&env, Error::WrongStatus),
        }
        let amount = lease.held + lease.fee;
        transfer(&env, &lease.payer, amount);
        lease.held = 0;
        lease.fee = 0;
        lease.status = Status::Refunded;
        save(&env, id, &lease);
        Refunded { id, amount }.publish(&env);
        amount
    }

    /// Ending a lease early needs both sides: the first call proposes, the other
    /// party's call (before the proposal lapses) settles. Rent already due goes to the
    /// landlord; the rest is refunded. Returns the refunded amount (0 when proposing).
    pub fn end_early(env: Env, id: u64, caller: Address) -> i128 {
        caller.require_auth();
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Active);
        require_party(&env, &lease, &caller);
        let now = env.ledger().timestamp();
        let live_proposal = lease.end_proposed_by.clone().filter(|p| {
            *p != caller && now <= lease.end_proposed_at + proposal_window(&lease)
        });
        if live_proposal.is_none() {
            lease.end_proposed_by = Some(caller.clone());
            lease.end_proposed_at = now;
            save(&env, id, &lease);
            EndProposed { id, by: caller, expires_at: now + proposal_window(&lease) }.publish(&env);
            return 0;
        }
        pay_due(&env, id, &mut lease);
        let refunded = refund_rest(&env, id, &mut lease);
        if lease.status != Status::Completed {
            lease.status = Status::Ended;
        }
        lease.end_proposed_by = None;
        save(&env, id, &lease);
        Ended { id, refunded }.publish(&env);
        refunded
    }

    /// The proposer withdraws their early-end proposal.
    pub fn cancel_end(env: Env, id: u64, caller: Address) {
        caller.require_auth();
        let mut lease = load(&env, id);
        if lease.end_proposed_by != Some(caller) {
            panic_with_error!(&env, Error::NotProposer);
        }
        lease.end_proposed_by = None;
        save(&env, id, &lease);
        EndCancelled { id }.publish(&env);
    }

    /// Either party pauses payouts and asks the lease's mediator to settle.
    pub fn dispute(env: Env, id: u64, caller: Address) {
        caller.require_auth();
        let mut lease = load(&env, id);
        require_party(&env, &lease, &caller);
        match lease.status {
            Status::Accepted | Status::Active => {}
            _ => panic_with_error!(&env, Error::WrongStatus),
        }
        lease.status = Status::Disputed;
        lease.end_proposed_by = None;
        save(&env, id, &lease);
        Disputed { id, by: caller }.publish(&env);
    }

    /// The lease's mediator settles a dispute by splitting the locked rent between
    /// landlord and payer. It cannot send funds anywhere else. If the lease never
    /// started, the service fee is refunded too.
    pub fn resolve(env: Env, id: u64, to_landlord: i128) {
        let mut lease = load(&env, id);
        lease.mediator.require_auth();
        require_status(&env, &lease, Status::Disputed);
        if to_landlord < 0 || to_landlord > lease.held {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if to_landlord > 0 {
            pay_landlord(&env, &mut lease, to_landlord);
            lease.held -= to_landlord;
        }
        if lease.start == 0 && lease.fee > 0 {
            lease.held += lease.fee;
            lease.fee = 0;
        }
        let to_payer = refund_rest(&env, id, &mut lease);
        lease.status = Status::Ended;
        save(&env, id, &lease);
        Resolved { id, to_landlord, to_payer }.publish(&env);
    }

    /// Landlord collects rent that couldn't be delivered earlier.
    pub fn claim(env: Env, id: u64) -> i128 {
        let mut lease = load(&env, id);
        lease.landlord.require_auth();
        let amount = lease.landlord_owed;
        if amount == 0 {
            panic_with_error!(&env, Error::NothingDue);
        }
        lease.landlord_owed = 0;
        transfer(&env, &lease.landlord, amount);
        save(&env, id, &lease);
        Claimed { id, amount }.publish(&env);
        amount
    }

    pub fn get_lease(env: Env, id: u64) -> Lease {
        let lease = load(&env, id);
        bump(&env, id);
        lease
    }

    /// Periods the landlord could collect right now on an active lease.
    pub fn periods_due(env: Env, id: u64) -> u32 {
        let lease = load(&env, id);
        due_periods(&env, &lease) - lease.paid_periods
    }

    pub fn lease_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    pub fn config(env: Env) -> Config {
        config(&env)
    }
}

fn config(env: &Env) -> Config {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

fn load(env: &Env, id: u64) -> Lease {
    env.storage()
        .persistent()
        .get(&DataKey::Lease(id))
        .unwrap_or_else(|| panic_with_error!(env, Error::LeaseNotFound))
}

fn save(env: &Env, id: u64, lease: &Lease) {
    env.storage().persistent().set(&DataKey::Lease(id), lease);
    bump(env, id);
}

fn bump(env: &Env, id: u64) {
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Lease(id), TTL_THRESHOLD, TTL_EXTEND);
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

fn require_status(env: &Env, lease: &Lease, status: Status) {
    if lease.status != status {
        panic_with_error!(env, Error::WrongStatus);
    }
}

fn require_party(env: &Env, lease: &Lease, caller: &Address) {
    if *caller != lease.payer && *caller != lease.landlord {
        panic_with_error!(env, Error::NotAParty);
    }
}

fn dispute_window(lease: &Lease) -> u64 {
    lease.period_secs.min(MAX_DISPUTE_WINDOW_SECS)
}

fn proposal_window(lease: &Lease) -> u64 {
    lease.period_secs.min(MAX_PROPOSAL_SECS)
}

/// Start the lease at `start`: collect the service fee and pay what's due.
fn activate(env: &Env, id: u64, lease: &mut Lease, start: u64) -> i128 {
    lease.start = start;
    lease.status = Status::Active;
    MovedIn { id, start }.publish(env);
    if lease.fee > 0 {
        let treasury = config(env).treasury;
        transfer(env, &treasury, lease.fee);
        FeeCollected { id, amount: lease.fee }.publish(env);
    }
    pay_due(env, id, lease)
}

/// Periods owed so far: the first on move-in, then one more each elapsed period.
fn due_periods(env: &Env, lease: &Lease) -> u32 {
    if lease.status != Status::Active {
        return lease.paid_periods;
    }
    let elapsed = (env.ledger().timestamp() - lease.start) / lease.period_secs;
    1u64.saturating_add(elapsed).min(lease.periods as u64) as u32
}

fn pay_due(env: &Env, id: u64, lease: &mut Lease) -> i128 {
    let due = due_periods(env, lease);
    if due <= lease.paid_periods {
        return 0;
    }
    let amount = lease.rent * (due - lease.paid_periods) as i128;
    pay_landlord(env, lease, amount);
    lease.held -= amount;
    lease.paid_periods = due;
    RentPaid { id, periods_paid: due, amount }.publish(env);
    if due == lease.periods {
        lease.status = Status::Completed;
        Completed { id }.publish(env);
    }
    amount
}

/// Push rent to the landlord; if they can't receive it right now, record it as owed
/// so it never blocks the payer's refund.
fn pay_landlord(env: &Env, lease: &mut Lease, amount: i128) {
    let token = token::Client::new(env, &config(env).token);
    let delivered = matches!(
        token.try_transfer(&env.current_contract_address(), &lease.landlord, &amount),
        Ok(Ok(()))
    );
    if !delivered {
        lease.landlord_owed += amount;
    }
}

fn refund_rest(env: &Env, id: u64, lease: &mut Lease) -> i128 {
    let amount = lease.held;
    if amount > 0 {
        transfer(env, &lease.payer, amount);
        lease.held = 0;
        Refunded { id, amount }.publish(env);
    }
    amount
}

fn transfer(env: &Env, to: &Address, amount: i128) {
    token::Client::new(env, &config(env).token).transfer(
        &env.current_contract_address(),
        to,
        &amount,
    );
}

mod test;
