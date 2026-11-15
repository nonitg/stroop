#![no_std]
//! Lends Stroop's idle rent into one Blend v2 pool, behind the same `deposit` / `withdraw`
//! interface as `demo_vault`, so the rent contract doesn't know or care which it talks to.
//!
//! Depositors are owed exactly what they put in. Blend's interest is the operator's
//! earnings. If the pool's value drops below what's owed (bad debt socialised to
//! suppliers), every depositor takes the same pro-rata cut and the rent contract's cover
//! fund makes up the difference.

use soroban_sdk::auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation};
use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error, token, vec, Address,
    Env, IntoVal, Map, Symbol, Vec,
};

#[cfg(test)]
mod test;

/// Blend's bToken rate has 12 decimals.
const SCALAR_12: i128 = 1_000_000_000_000;
const SUPPLY: u32 = 0;
const WITHDRAW: u32 = 1;

// Mirrors of Blend v2 pool types (blend-contracts-v2 pool/src). Field names must match exactly.
#[contracttype]
#[derive(Clone)]
pub struct Request {
    pub request_type: u32,
    pub address: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct Positions {
    pub liabilities: Map<u32, i128>,
    pub collateral: Map<u32, i128>,
    pub supply: Map<u32, i128>,
}

#[contracttype]
#[derive(Clone)]
pub struct ReserveConfig {
    pub index: u32,
    pub decimals: u32,
    pub c_factor: u32,
    pub l_factor: u32,
    pub util: u32,
    pub max_util: u32,
    pub r_base: u32,
    pub r_one: u32,
    pub r_two: u32,
    pub r_three: u32,
    pub reactivity: u32,
    pub supply_cap: i128,
    pub enabled: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct ReserveData {
    pub d_rate: i128,
    pub b_rate: i128,
    pub ir_mod: i128,
    pub b_supply: i128,
    pub d_supply: i128,
    pub backstop_credit: i128,
    pub last_time: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct Reserve {
    pub asset: Address,
    pub config: ReserveConfig,
    pub data: ReserveData,
    pub scalar: i128,
}

#[contractclient(name = "PoolClient")]
pub trait Pool {
    fn submit(env: Env, from: Address, spender: Address, to: Address, requests: Vec<Request>) -> Positions;
    fn get_reserve(env: Env, asset: Address) -> Reserve;
    fn get_positions(env: Env, address: Address) -> Positions;
}

#[contracttype]
enum DataKey {
    Pool,
    Token,
    Admin,
    TotalOwed,
    Owed(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
}

const TTL_THRESHOLD: u32 = 500_000;
const TTL_EXTEND: u32 = 3_000_000;

#[contract]
pub struct BlendAdapter;

#[contractimpl]
impl BlendAdapter {
    /// `pool` and `token` are fixed for life: Stroop can't move lent rent to another venue.
    pub fn __constructor(env: Env, pool: Address, token: Address, admin: Address) {
        let s = env.storage().instance();
        s.set(&DataKey::Pool, &pool);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::Admin, &admin);
    }

    pub fn deposit(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let me = env.current_contract_address();
        token(&env).transfer(&from, &me, &amount);
        supply(&env, amount);
        set_owed(&env, &from, owed(&env, &from) + amount);
        set_total(&env, total(&env) + amount);
    }

    /// Returns `amount` of `from`'s principal, or its pro-rata share if the pool is worth
    /// less than everyone is owed. Panics if Blend can't pay out right now (pool fully lent).
    pub fn withdraw(env: Env, from: Address, amount: i128) -> i128 {
        from.require_auth();
        let mine = owed(&env, &from);
        if amount <= 0 || amount > mine {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let all = total(&env);
        let out = amount * value(&env).min(all) / all;
        let got = pull(&env, &from, out);
        set_owed(&env, &from, mine - amount);
        set_total(&env, all - amount);
        got
    }

    pub fn owed(env: Env, from: Address) -> i128 {
        owed(&env, &from)
    }

    /// What the Blend position is worth now, in the underlying token.
    pub fn value(env: Env) -> i128 {
        value(&env)
    }

    /// The operator's earnings: pool value above what depositors are owed.
    pub fn earnings(env: Env) -> i128 {
        (value(&env) - total(&env)).max(0)
    }

    pub fn harvest(env: Env) -> i128 {
        let admin = admin(&env);
        admin.require_auth();
        let amount = Self::earnings(env.clone());
        if amount > 0 {
            pull(&env, &admin, amount)
        } else {
            0
        }
    }
}

/// Supply `amount` from this adapter into the pool. Blend pulls it with `transfer`, which
/// this contract has to authorize since the pool, not us, is the direct caller.
fn supply(env: &Env, amount: i128) {
    let me = env.current_contract_address();
    let pool = pool(env);
    let asset: Address = env.storage().instance().get(&DataKey::Token).unwrap();
    env.authorize_as_current_contract(vec![
        env,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: asset.clone(),
                fn_name: Symbol::new(env, "transfer"),
                args: vec![env, me.into_val(env), pool.into_val(env), amount.into_val(env)],
            },
            sub_invocations: vec![env],
        }),
    ]);
    let req = Request { request_type: SUPPLY, address: asset, amount };
    PoolClient::new(env, &pool).submit(&me, &me, &me, &vec![env, req]);
}

/// Withdraw `amount` of underlying from the pool straight to `to`; returns what arrived.
fn pull(env: &Env, to: &Address, amount: i128) -> i128 {
    if amount <= 0 {
        return 0;
    }
    let me = env.current_contract_address();
    let t = token(env);
    let before = t.balance(to);
    let req = Request { request_type: WITHDRAW, address: t.address.clone(), amount };
    PoolClient::new(env, &pool(env)).submit(&me, &me, to, &vec![env, req]);
    t.balance(to) - before
}

fn value(env: &Env) -> i128 {
    let me = env.current_contract_address();
    let p = PoolClient::new(env, &pool(env));
    let reserve = p.get_reserve(&token(env).address);
    let b_tokens = p.get_positions(&me).supply.get(reserve.config.index).unwrap_or(0);
    b_tokens * reserve.data.b_rate / SCALAR_12
}

fn pool(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Pool).unwrap()
}

fn token(env: &Env) -> token::Client<'_> {
    let id: Address = env.storage().instance().get(&DataKey::Token).unwrap();
    token::Client::new(env, &id)
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn owed(env: &Env, from: &Address) -> i128 {
    env.storage().persistent().get(&DataKey::Owed(from.clone())).unwrap_or(0)
}

fn set_owed(env: &Env, from: &Address, amount: i128) {
    let key = DataKey::Owed(from.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

fn total(env: &Env) -> i128 {
    env.storage().instance().get(&DataKey::TotalOwed).unwrap_or(0)
}

fn set_total(env: &Env, amount: i128) {
    env.storage().instance().set(&DataKey::TotalOwed, &amount);
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}
