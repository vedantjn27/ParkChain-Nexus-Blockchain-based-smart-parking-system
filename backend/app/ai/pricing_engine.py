"""Verifiable AI pricing engine."""

from dataclasses import asdict, dataclass

from eth_abi import encode
from web3 import Web3

from app.ai.mistral_client import MistralClient


MIN_PRICE_PER_MINUTE = 0.5
MAX_PRICE_PER_MINUTE = 10.0


@dataclass(frozen=True)
class PricingInputs:
    current_occupancy_pct: float
    time_of_day: int
    day_of_week: int
    historical_demand_factor: float
    base_price: float
    weather_flag: str
    nonce: str


@dataclass(frozen=True)
class PricingResult:
    inputs: PricingInputs
    commit_hash: str
    price_per_minute: float
    surge_multiplier: float
    rationale: str
    source: str


def compute_pricing_commit_hash(inputs: PricingInputs) -> str:
    encoded_inputs = encode(
        ["uint256", "uint256", "uint256", "uint256", "uint256", "string", "string"],
        [
            int(inputs.current_occupancy_pct * 100),
            inputs.time_of_day,
            inputs.day_of_week,
            int(inputs.historical_demand_factor * 100),
            int(inputs.base_price * 100),
            inputs.weather_flag,
            inputs.nonce,
        ],
    )
    return Web3.keccak(encoded_inputs).hex()


def pricing_inputs_for_contract(inputs: PricingInputs) -> tuple[int, int, int, int, int, str, str]:
    return (
        int(inputs.current_occupancy_pct * 100),
        inputs.time_of_day,
        inputs.day_of_week,
        int(inputs.historical_demand_factor * 100),
        int(inputs.base_price * 100),
        inputs.weather_flag,
        inputs.nonce,
    )


def clamp_price(value: float) -> float:
    return round(min(max(value, MIN_PRICE_PER_MINUTE), MAX_PRICE_PER_MINUTE), 4)


def _fallback_price(inputs: PricingInputs) -> dict[str, float | str]:
    occupancy_factor = 1 + (inputs.current_occupancy_pct / 100)
    demand_factor = max(inputs.historical_demand_factor, 0.8)
    surge_multiplier = round(min(occupancy_factor * demand_factor, 3.0), 2)
    price = clamp_price(inputs.base_price * surge_multiplier)
    return {
        "price_per_minute": price,
        "surge_multiplier": surge_multiplier,
        "rationale": "Price uses current occupancy, demand pressure, and base lot pricing.",
    }


def calculate_ai_price(inputs: PricingInputs, client: MistralClient | None = None) -> PricingResult:
    system_prompt = (
        "Return strict JSON with keys price_per_minute, surge_multiplier, and rationale. "
        "Keep rationale to one or two plain-English sentences. Do not include markdown."
    )
    source = "mistral"
    try:
        response = (client or MistralClient()).complete_json(
            system_prompt=system_prompt,
            user_payload=asdict(inputs),
            model="mistral-large-latest",
        )
    except Exception:
        response = _fallback_price(inputs)
        source = "fallback"

    price = clamp_price(float(response["price_per_minute"]))
    surge_multiplier = round(float(response.get("surge_multiplier", price / inputs.base_price)), 4)
    rationale = str(response.get("rationale", "Price computed from verified demand inputs."))

    return PricingResult(
        inputs=inputs,
        commit_hash=compute_pricing_commit_hash(inputs),
        price_per_minute=price,
        surge_multiplier=surge_multiplier,
        rationale=rationale,
        source=source,
    )
