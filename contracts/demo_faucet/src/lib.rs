#![no_std]
//! Testnet-only faucet. It is the admin of the demo stablecoin (test USDC or test CAD),
//! so demo users can mint play money without anyone sharing the issuer's secret key.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error,
    token::StellarAssetClient, Address, Env,
};

/// 20,000 units (7 decimals) per request.
const DRIP: i128 = 20_000_0000000;
/// Most one `send` can mint: stands in for one bank transfer through the on-ramp.
const MAX_SEND: i128 = 200_000_0000000;

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum Error {
    BadAmount = 1,
}

#[contracttype]
enum DataKey {
    Token,
}

#[contract]
pub struct DemoFaucet;

#[contractimpl]
impl DemoFaucet {
    pub fn __constructor(env: Env, token: Address) {
        env.storage().instance().set(&DataKey::Token, &token);
    }

    pub fn drip(env: Env, to: Address) -> i128 {
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        StellarAssetClient::new(&env, &token).mint(&to, &DRIP);
        env.storage().instance().extend_ttl(500_000, 6_300_000);
        DRIP
    }

    /// Demo on-ramp: mints exactly what the family's bank transfer would have bought.
    pub fn send(env: Env, to: Address, amount: i128) -> i128 {
        if amount <= 0 || amount > MAX_SEND {
            panic_with_error!(&env, Error::BadAmount);
        }
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        StellarAssetClient::new(&env, &token).mint(&to, &amount);
        env.storage().instance().extend_ttl(500_000, 6_300_000);
        amount
    }

    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }
}

#[cfg(test)]
mod test;
