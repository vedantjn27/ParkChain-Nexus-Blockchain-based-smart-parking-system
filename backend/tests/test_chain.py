from app.chain.contracts import configured_contracts
from app.chain.relayer import get_relayer_address


def test_contract_configuration_reports_expected_contracts() -> None:
    assert configured_contracts() == {
        "ParkingSessionManager": True,
        "TrustScoreSBT": True,
        "EscrowSettlement": True,
        "GreenCreditToken": True,
        "ParkCoin": True,
    }


def test_relayer_address_is_derived_from_env_key() -> None:
    assert get_relayer_address().startswith("0x")
    assert len(get_relayer_address()) == 42
