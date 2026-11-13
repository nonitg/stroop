#![no_std]
//! Testnet-only faucet. It is the admin of the demo "USDC" Stellar asset, so demo
//! users can mint play money without anyone sharing the issuer's secret key.

use soroban_sdk::{contract, contractimpl, contracttype, token::StellarAssetClient, Address, Env};

/// 20,000 USDC (7 decimals) per request.
const DRIP: i128 = 20_000_0000000;

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

    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }
}
