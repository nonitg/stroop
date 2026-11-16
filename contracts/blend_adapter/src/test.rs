#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{map, token::StellarAssetClient};

/// Minimal Blend pool: one reserve, supply/withdraw only, bToken rate set by the test.
#[contract]
struct MockPool;

#[contracttype]
enum PoolKey {
    Asset,
    Rate,
    B(Address),
}

#[contractimpl]
impl MockPool {
    pub fn __constructor(env: Env, asset: Address) {
        env.storage().instance().set(&PoolKey::Asset, &asset);
        env.storage().instance().set(&PoolKey::Rate, &SCALAR_12);
    }

    pub fn set_rate(env: Env, rate: i128) {
        env.storage().instance().set(&PoolKey::Rate, &rate);
    }

    pub fn submit(env: Env, from: Address, spender: Address, to: Address, requests: Vec<Request>) -> Positions {
        spender.require_auth();
        let asset: Address = env.storage().instance().get(&PoolKey::Asset).unwrap();
        let t = token::Client::new(&env, &asset);
        let rate: i128 = env.storage().instance().get(&PoolKey::Rate).unwrap();
        let mut b = b_of(&env, &from);
        for r in requests.iter() {
            if r.request_type == SUPPLY {
                t.transfer(&spender, &env.current_contract_address(), &r.amount);
                b += r.amount * SCALAR_12 / rate;
            } else {
                // Same as Blend: burn rounded up, capped at the position.
                let mut burn = (r.amount * SCALAR_12 + rate - 1) / rate;
                let mut out = r.amount;
                if burn > b {
                    burn = b;
                    out = b * rate / SCALAR_12;
                }
                b -= burn;
                t.transfer(&env.current_contract_address(), &to, &out);
            }
        }
        env.storage().instance().set(&PoolKey::B(from.clone()), &b);
        Self::get_positions(env, from)
    }

    pub fn get_reserve(env: Env, asset: Address) -> Reserve {
        let rate: i128 = env.storage().instance().get(&PoolKey::Rate).unwrap();
        Reserve {
            asset,
            config: ReserveConfig {
                index: 3,
                decimals: 7,
                c_factor: 0,
                l_factor: 0,
                util: 0,
                max_util: 0,
                r_base: 0,
                r_one: 0,
                r_two: 0,
                r_three: 0,
                reactivity: 0,
                supply_cap: i128::MAX,
                enabled: true,
            },
            data: ReserveData {
                d_rate: SCALAR_12,
                b_rate: rate,
                ir_mod: 0,
                b_supply: 0,
                d_supply: 0,
                backstop_credit: 0,
                last_time: 0,
            },
            scalar: 10_000_000,
        }
    }

    pub fn get_positions(env: Env, address: Address) -> Positions {
        Positions { liabilities: map![&env], collateral: map![&env], supply: map![&env, (3u32, b_of(&env, &address))] }
    }
}

fn b_of(env: &Env, who: &Address) -> i128 {
    env.storage().instance().get(&PoolKey::B(who.clone())).unwrap_or(0)
}

struct Setup<'a> {
    env: Env,
    token: token::Client<'a>,
    pool: MockPoolClient<'a>,
    adapter: BlendAdapterClient<'a>,
    admin: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer).address();
    let pool = env.register(MockPool, (sac.clone(),));
    let admin = Address::generate(&env);
    let adapter = env.register(BlendAdapter, (pool.clone(), sac.clone(), admin.clone()));
    Setup {
        token: token::Client::new(&env, &sac),
        pool: MockPoolClient::new(&env, &pool),
        adapter: BlendAdapterClient::new(&env, &adapter),
        admin,
        env,
    }
}

fn funded(s: &Setup, amount: i128) -> Address {
    let who = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.token.address).mint(&who, &amount);
    who
}

#[test]
fn deposit_goes_to_blend_and_comes_back_whole_with_interest_for_stroop() {
    let s = setup();
    let lease = funded(&s, 1_000);
    s.adapter.deposit(&lease, &1_000);
    assert_eq!(s.token.balance(&s.pool.address), 1_000);
    assert_eq!(s.adapter.value(), 1_000);

    // Blend accrues 5%: the pool now owes suppliers more than it took in.
    s.pool.set_rate(&(SCALAR_12 * 105 / 100));
    StellarAssetClient::new(&s.env, &s.token.address).mint(&s.pool.address, &50);
    assert_eq!(s.adapter.earnings(), 50);

    assert_eq!(s.adapter.withdraw(&lease, &1_000), 1_000);
    assert_eq!(s.token.balance(&lease), 1_000);
    // Blend rounds burns up, so a unit of dust stays in the pool.
    assert_eq!(s.adapter.harvest(), 49);
    assert_eq!(s.token.balance(&s.admin), 49);
}

#[test]
fn a_pool_loss_is_shared_pro_rata() {
    let s = setup();
    let a = funded(&s, 600);
    let b = funded(&s, 400);
    s.adapter.deposit(&a, &600);
    s.adapter.deposit(&b, &400);

    // Bad debt: the pool's bTokens are now worth 10% less.
    s.pool.set_rate(&(SCALAR_12 * 90 / 100));
    assert_eq!(s.adapter.withdraw(&a, &600), 540);
    assert_eq!(s.adapter.withdraw(&b, &400), 360);
    assert_eq!(s.adapter.earnings(), 0);
}
