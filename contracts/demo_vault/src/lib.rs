#![no_std]
//! Testnet stand-in for the lending venue (a Blend USDC pool adapter on mainnet).
//!
//! It owes each depositor exactly what they put in. Anything above that is the
//! operator's earnings. On testnet nobody borrows, so earnings come from manual top-ups
//! and `simulate_loss` lets a demo show what happens when a pool loses money.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env};

#[contracttype]
enum DataKey {
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
pub struct DemoVault;

#[contractimpl]
impl DemoVault {
    pub fn __constructor(env: Env, token: Address, admin: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn deposit(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        token(&env).transfer(&from, &env.current_contract_address(), &amount);
        set_owed(&env, &from, owed(&env, &from) + amount);
        set_total(&env, total(&env) + amount);
    }

    /// Returns `amount` of `from`'s principal, or whatever is left if the pool lost money.
    pub fn withdraw(env: Env, from: Address, amount: i128) -> i128 {
        from.require_auth();
        let mine = owed(&env, &from);
        if amount <= 0 || amount > mine {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let t = token(&env);
        let out = amount.min(t.balance(&env.current_contract_address()));
        if out > 0 {
            t.transfer(&env.current_contract_address(), &from, &out);
        }
        set_owed(&env, &from, mine - amount);
        set_total(&env, total(&env) - amount);
        out
    }

    pub fn owed(env: Env, from: Address) -> i128 {
        owed(&env, &from)
    }

    /// The operator's earnings: everything held above what depositors are owed.
    pub fn earnings(env: Env) -> i128 {
        (token(&env).balance(&env.current_contract_address()) - total(&env)).max(0)
    }

    pub fn harvest(env: Env) -> i128 {
        let admin = admin(&env);
        admin.require_auth();
        let amount = Self::earnings(env.clone());
        if amount > 0 {
            token(&env).transfer(&env.current_contract_address(), &admin, &amount);
        }
        amount
    }

    /// Testnet demo only: the pool loses `amount` (sent to the admin), as if a borrower defaulted.
    /// Open to anyone so the demo app can trigger it; the tokens have no value.
    pub fn simulate_loss(env: Env, amount: i128) -> i128 {
        let t = token(&env);
        let out = amount.min(t.balance(&env.current_contract_address()));
        if out > 0 {
            t.transfer(&env.current_contract_address(), &admin(&env), &out);
        }
        out
    }
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
