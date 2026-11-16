#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::token::TokenClient;

#[test]
fn send_mints_the_exact_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let faucet = env.register(DemoFaucet, (sac.address(),));
    StellarAssetClient::new(&env, &sac.address()).set_admin(&faucet);

    let to = Address::generate(&env);
    let client = DemoFaucetClient::new(&env, &faucet);
    client.send(&to, &12_060_0000000);
    assert_eq!(
        TokenClient::new(&env, &sac.address()).balance(&to),
        12_060_0000000
    );
    assert!(client.try_send(&to, &(MAX_SEND + 1)).is_err());
}
