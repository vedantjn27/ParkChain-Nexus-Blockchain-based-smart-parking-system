"""WebSocket routes for live chain feed."""

import json
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.db.models import ChainEvent


router = APIRouter(tags=["websocket"])


class ChainFeedManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        await websocket.send_json(
            {
                "type": "feed_connected",
                "payload": {"message": "ParkChain live chain feed connected"},
            }
        )

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        disconnected: list[WebSocket] = []
        for websocket in self.active_connections:
            try:
                await websocket.send_json(message)
            except RuntimeError:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(websocket)


chain_feed_manager = ChainFeedManager()


def chain_event_message(event: ChainEvent) -> dict[str, Any]:
    return {
        "type": "tx_confirmed",
        "payload": {
            "event_type": event.event_type,
            "session_id": event.session_id,
            "block_number": event.block_number,
            "tx_hash": event.tx_hash,
            "payload": json.loads(event.payload_json),
        },
    }


@router.websocket("/ws/chain-feed")
async def chain_feed(websocket: WebSocket) -> None:
    await chain_feed_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        chain_feed_manager.disconnect(websocket)
