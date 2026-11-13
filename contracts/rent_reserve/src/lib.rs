#![no_std]
//! RentProof rent reserve.
//!
//! A newcomer (or their family) locks a lease's rent in this contract instead of
//! wiring months of cash to a landlord. The landlord can verify the locked funds
//! on-chain, rent is released one period at a time, and money not yet owed is
//! refunded under rules both sides agreed to up front.

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
    /// Landlord accepted; waiting for the tenant to confirm move-in.
    Accepted = 1,
    /// Tenant moved in; rent releases each period.
    Active = 2,
    /// Every period was paid to the landlord.
    Completed = 3,
    /// Ended early (mutual agreement or resolver); unused rent refunded.
    Ended = 4,
    /// Never moved in; full reserve returned to the payer.
    Refunded = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Lease {
    /// Family or student wallet that funds the reserve and receives refunds.
    pub payer: Address,
    pub landlord: Address,
    pub token: Address,
    /// Rent per period, in token base units.
    pub rent: i128,
    pub periods: u32,
    /// Length of one rent period (30 days in production; seconds in demos).
    pub period_secs: u64,
    pub created_at: u64,
    /// Move-in must be confirmed by this time or the payer may reclaim everything.
    pub move_in_by: u64,
    /// Move-in timestamp; 0 until the tenant confirms.
    pub start: u64,
    pub paid_periods: u32,
    /// Funds currently locked for this lease.
    pub held: i128,
    pub status: Status,
    /// Party that proposed ending the lease early, awaiting the other's agreement.
    pub end_proposed_by: Option<Address>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    InvalidTerms = 2,
    LeaseNotFound = 3,
    WrongStatus = 4,
    NotAParty = 5,
    NothingDue = 6,
    MoveInWindowOpen = 7,
    MoveInWindowClosed = 8,
    InvalidAmount = 9,
}

#[contracttype]
enum DataKey {
    Resolver,
    Count,
    Lease(u64),
}

const MAX_PERIODS: u32 = 24;
// Keep lease records alive for ~a year of ledgers (5s each) on every touch.
const LEASE_TTL_THRESHOLD: u32 = 500_000;
const LEASE_TTL_EXTEND: u32 = 6_300_000;

#[contractevent(topics = ["funded"])]
pub struct Funded {
    #[topic]
    pub id: u64,
    pub payer: Address,
    pub landlord: Address,
    pub amount: i128,
}

#[contractevent(topics = ["accepted"])]
pub struct Accepted {
    #[topic]
    pub id: u64,
}

#[contractevent(topics = ["moved_in"])]
pub struct MovedIn {
    #[topic]
    pub id: u64,
    pub start: u64,
}

#[contractevent(topics = ["rent_paid"])]
pub struct RentPaid {
    #[topic]
    pub id: u64,
    pub periods_paid: u32,
    pub amount: i128,
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
}

#[contract]
pub struct RentReserve;

#[contractimpl]
impl RentReserve {
    /// `resolver` is a neutral party (e.g. a settlement agency or mediator) that can
    /// settle disputes. It can only split a lease's locked funds between the payer
    /// and landlord; it can never send them anywhere else.
    pub fn __constructor(env: Env, resolver: Address) {
        if env.storage().instance().has(&DataKey::Resolver) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Resolver, &resolver);
        env.storage().instance().set(&DataKey::Count, &0u64);
    }

    /// Lock `rent * periods` from `payer` for a new lease. Returns the lease id.
    pub fn create(
        env: Env,
        payer: Address,
        landlord: Address,
        token: Address,
        rent: i128,
        periods: u32,
        period_secs: u64,
        move_in_window_secs: u64,
    ) -> u64 {
        payer.require_auth();
        if rent <= 0
            || periods == 0
            || periods > MAX_PERIODS
            || period_secs == 0
            || move_in_window_secs == 0
            || payer == landlord
        {
            panic_with_error!(&env, Error::InvalidTerms);
        }
        let total = rent
            .checked_mul(periods as i128)
            .unwrap_or_else(|| panic_with_error!(&env, Error::InvalidTerms));

        token::Client::new(&env, &token).transfer(&payer, &env.current_contract_address(), &total);

        let id: u64 = env.storage().instance().get(&DataKey::Count).unwrap_or(0);
        env.storage().instance().set(&DataKey::Count, &(id + 1));

        let now = env.ledger().timestamp();
        let lease = Lease {
            payer: payer.clone(),
            landlord: landlord.clone(),
            token,
            rent,
            periods,
            period_secs,
            created_at: now,
            move_in_by: now + move_in_window_secs,
            start: 0,
            paid_periods: 0,
            held: total,
            status: Status::Funded,
            end_proposed_by: None,
        };
        save(&env, id, &lease);
        Funded { id, payer, landlord, amount: total }.publish(&env);
        id
    }

    /// Landlord commits to the lease terms. Until then the payer can cancel freely.
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

    /// Tenant confirms they received the keys. Starts the schedule and pays month one.
    pub fn move_in(env: Env, id: u64) {
        let mut lease = load(&env, id);
        lease.payer.require_auth();
        require_status(&env, &lease, Status::Accepted);
        let now = env.ledger().timestamp();
        if now > lease.move_in_by {
            panic_with_error!(&env, Error::MoveInWindowClosed);
        }
        lease.start = now;
        lease.status = Status::Active;
        MovedIn { id, start: now }.publish(&env);
        pay_due(&env, id, &mut lease);
        save(&env, id, &lease);
    }

    /// Pay the landlord every period that has come due. Anyone may call this (a
    /// scheduler in production): the money can only ever go to the landlord, and
    /// never ahead of schedule. Returns the amount paid.
    pub fn release(env: Env, id: u64) -> i128 {
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Active);
        let paid = pay_due(&env, id, &mut lease);
        if paid == 0 {
            panic_with_error!(&env, Error::NothingDue);
        }
        save(&env, id, &lease);
        paid
    }

    /// Payer gets the full reserve back if the landlord never accepted, or if the
    /// move-in deadline passed without the tenant getting the keys (e.g. a fake listing).
    pub fn reclaim(env: Env, id: u64) -> i128 {
        let mut lease = load(&env, id);
        lease.payer.require_auth();
        match lease.status {
            Status::Funded => {}
            Status::Accepted => {
                if env.ledger().timestamp() <= lease.move_in_by {
                    panic_with_error!(&env, Error::MoveInWindowOpen);
                }
            }
            _ => panic_with_error!(&env, Error::WrongStatus),
        }
        let amount = lease.held;
        transfer(&env, &lease, &lease.payer, amount);
        lease.held = 0;
        lease.status = Status::Refunded;
        save(&env, id, &lease);
        Refunded { id, amount }.publish(&env);
        amount
    }

    /// Ending a lease early needs both sides: the first call proposes, the other
    /// party's call settles. Rent already due goes to the landlord; the rest is
    /// refunded to the payer. Returns the refunded amount (0 when only proposed).
    pub fn end_early(env: Env, id: u64, caller: Address) -> i128 {
        caller.require_auth();
        let mut lease = load(&env, id);
        require_status(&env, &lease, Status::Active);
        if caller != lease.payer && caller != lease.landlord {
            panic_with_error!(&env, Error::NotAParty);
        }
        match lease.end_proposed_by.clone() {
            Some(proposer) if proposer != caller => {
                pay_due(&env, id, &mut lease);
                let refund = refund_rest(&env, id, &mut lease);
                lease.status = Status::Ended;
                lease.end_proposed_by = None;
                save(&env, id, &lease);
                refund
            }
            _ => {
                lease.end_proposed_by = Some(caller.clone());
                save(&env, id, &lease);
                EndProposed { id, by: caller }.publish(&env);
                0
            }
        }
    }

    /// Dispute settlement: the resolver splits the locked funds between landlord and
    /// payer. It cannot route funds to itself or anyone else.
    pub fn resolve(env: Env, id: u64, to_landlord: i128) {
        let resolver: Address = env.storage().instance().get(&DataKey::Resolver).unwrap();
        resolver.require_auth();
        let mut lease = load(&env, id);
        match lease.status {
            Status::Funded | Status::Accepted | Status::Active => {}
            _ => panic_with_error!(&env, Error::WrongStatus),
        }
        if to_landlord < 0 || to_landlord > lease.held {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if to_landlord > 0 {
            transfer(&env, &lease, &lease.landlord, to_landlord);
            lease.held -= to_landlord;
            RentPaid { id, periods_paid: lease.paid_periods, amount: to_landlord }.publish(&env);
        }
        refund_rest(&env, id, &mut lease);
        lease.status = Status::Ended;
        save(&env, id, &lease);
    }

    pub fn get_lease(env: Env, id: u64) -> Lease {
        let lease = load(&env, id);
        bump(&env, id);
        lease
    }

    /// Periods the landlord could collect right now.
    pub fn periods_due(env: Env, id: u64) -> u32 {
        let lease = load(&env, id);
        due_periods(&env, &lease) - lease.paid_periods
    }

    pub fn lease_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Count).unwrap_or(0)
    }

    pub fn resolver(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Resolver).unwrap()
    }
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
        .extend_ttl(&DataKey::Lease(id), LEASE_TTL_THRESHOLD, LEASE_TTL_EXTEND);
    env.storage()
        .instance()
        .extend_ttl(LEASE_TTL_THRESHOLD, LEASE_TTL_EXTEND);
}

fn require_status(env: &Env, lease: &Lease, status: Status) {
    if lease.status != status {
        panic_with_error!(env, Error::WrongStatus);
    }
}

/// Periods owed so far: the first on move-in, then one more each elapsed period.
fn due_periods(env: &Env, lease: &Lease) -> u32 {
    if lease.status != Status::Active {
        return lease.paid_periods;
    }
    let elapsed = (env.ledger().timestamp() - lease.start) / lease.period_secs;
    let due = 1u64.saturating_add(elapsed).min(lease.periods as u64);
    due as u32
}

fn pay_due(env: &Env, id: u64, lease: &mut Lease) -> i128 {
    let due = due_periods(env, lease);
    if due <= lease.paid_periods {
        return 0;
    }
    let amount = lease.rent * (due - lease.paid_periods) as i128;
    transfer(env, lease, &lease.landlord, amount);
    lease.held -= amount;
    lease.paid_periods = due;
    if due == lease.periods {
        lease.status = Status::Completed;
    }
    RentPaid { id, periods_paid: due, amount }.publish(env);
    amount
}

fn refund_rest(env: &Env, id: u64, lease: &mut Lease) -> i128 {
    let amount = lease.held;
    if amount > 0 {
        transfer(env, lease, &lease.payer, amount);
        lease.held = 0;
        Refunded { id, amount }.publish(env);
    }
    amount
}

fn transfer(env: &Env, lease: &Lease, to: &Address, amount: i128) {
    token::Client::new(env, &lease.token).transfer(&env.current_contract_address(), to, &amount);
}

mod test;
