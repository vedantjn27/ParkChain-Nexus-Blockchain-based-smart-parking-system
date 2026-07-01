"""Mistral API client wrapper."""

import json
from typing import Any

from mistralai.client import Mistral

from app.core.config import get_settings


class MistralClient:
    def __init__(self) -> None:
        self.settings = get_settings()

    def complete_json(self, *, system_prompt: str, user_payload: dict[str, Any], model: str) -> dict[str, Any]:
        if not self.settings.mistral_api_key:
            raise RuntimeError("MISTRAL_API_KEY is not configured")

        client = Mistral(api_key=self.settings.mistral_api_key)
        response = client.chat.complete(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            response_format={"type": "json_object"},
        )
        content = response.choices[0].message.content
        if not isinstance(content, str):
            raise RuntimeError("Mistral returned an empty response")
        return json.loads(content)
