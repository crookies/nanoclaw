"""Conversation service — parses Claude SDK JSONL transcripts."""
import json
from pathlib import Path

from config import settings
from db import central_db, session_db


def _outbound_path(ag_id: str, sess_id: str) -> Path:
    return settings.sessions_dir / ag_id / sess_id / "outbound.db"


def _jsonl_dir(ag_id: str) -> Path:
    return settings.sessions_dir / ag_id / ".claude-shared" / "projects" / "-workspace-agent"


def _get_sdk_session_id(ag_id: str, sess_id: str) -> str | None:
    outbound = _outbound_path(ag_id, sess_id)
    if not outbound.exists():
        return None
    try:
        with session_db(outbound) as conn:
            row = conn.execute(
                "SELECT value FROM session_state WHERE key='continuation:claude'"
            ).fetchone()
            if row:
                return row["value"]
            # Legacy key
            row = conn.execute(
                "SELECT value FROM session_state WHERE key='sdk_session_id'"
            ).fetchone()
            if row:
                return row["value"]
    except Exception:
        pass
    return None


def _extract_text_content(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "\n".join(p for p in parts if p)
    return ""


def _parse_jsonl(path: Path) -> tuple[list[dict], dict[str, dict]]:
    """Return (raw_entries, tool_result_map).
    raw_entries: user/assistant/tool_result items in order.
    tool_result_map: {tool_use_id: {content, is_error}}
    """
    raw: list[dict] = []
    tool_result_map: dict[str, dict] = {}

    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                t = obj.get("type")
                if t not in ("user", "assistant"):
                    continue

                if t == "user":
                    content = obj.get("message", {}).get("content", "")
                    uuid = obj.get("uuid") or obj.get("parentUuid")

                    if isinstance(content, str):
                        if content.strip():
                            raw.append({"type": "user", "uuid": uuid, "text": content})
                    elif isinstance(content, list):
                        human_blocks = []
                        for block in content:
                            if not isinstance(block, dict):
                                continue
                            btype = block.get("type")
                            if btype == "tool_result":
                                tid = block.get("tool_use_id")
                                bc = block.get("content", "")
                                if isinstance(bc, list):
                                    bc_text = "\n".join(
                                        b.get("text", "") for b in bc
                                        if isinstance(b, dict) and b.get("type") == "text"
                                    )
                                else:
                                    bc_text = str(bc)
                                if tid:
                                    tool_result_map[tid] = {
                                        "content": bc_text[:4000],
                                        "is_error": bool(block.get("is_error")),
                                    }
                            elif btype == "text":
                                t_text = block.get("text", "")
                                if t_text.strip():
                                    human_blocks.append(t_text)

                        if human_blocks:
                            raw.append(
                                {"type": "user", "uuid": uuid, "text": "\n".join(human_blocks)}
                            )

                elif t == "assistant":
                    content = obj.get("message", {}).get("content", [])
                    uuid = obj.get("uuid")
                    timestamp = obj.get("message", {}).get("timestamp")

                    text_parts: list[str] = []
                    tool_uses: list[dict] = []

                    for block in content:
                        if not isinstance(block, dict):
                            continue
                        btype = block.get("type")
                        if btype == "text":
                            txt = block.get("text", "")
                            if txt.strip():
                                text_parts.append(txt)
                        elif btype == "tool_use":
                            tool_uses.append(
                                {
                                    "id": block.get("id"),
                                    "name": block.get("name"),
                                    "input": block.get("input", {}),
                                    "result": None,  # filled later
                                }
                            )
                        # skip "thinking" blocks

                    if text_parts or tool_uses:
                        entry: dict = {"type": "assistant", "uuid": uuid, "timestamp": timestamp}
                        if text_parts:
                            entry["text"] = "\n".join(text_parts)
                        if tool_uses:
                            entry["tool_uses"] = tool_uses
                        raw.append(entry)

    except (OSError, IOError):
        pass

    return raw, tool_result_map


def _attach_tool_results(entries: list[dict], tool_result_map: dict[str, dict]) -> list[dict]:
    """Attach tool results to their corresponding tool_use entries."""
    for entry in entries:
        if entry.get("type") == "assistant" and "tool_uses" in entry:
            for tu in entry["tool_uses"]:
                tid = tu.get("id")
                if tid and tid in tool_result_map:
                    tu["result"] = tool_result_map[tid]
    return entries


def get_conversation(agent_group_id: str, session_id: str) -> dict:
    sdk_session_id = _get_sdk_session_id(agent_group_id, session_id)
    jsonl_dir = _jsonl_dir(agent_group_id)

    entries: list[dict] = []
    current_jsonl: str | None = None
    archived_jsonl: list[str] = []

    if sdk_session_id and jsonl_dir.exists():
        current_path = jsonl_dir / f"{sdk_session_id}.jsonl"
        current_jsonl = sdk_session_id

        if current_path.exists():
            raw, tool_result_map = _parse_jsonl(current_path)
            entries = _attach_tool_results(raw, tool_result_map)

        # List other JSONL files as archives
        try:
            for p in sorted(jsonl_dir.iterdir()):
                if p.suffix == ".jsonl" and p.stem != sdk_session_id:
                    archived_jsonl.append(p.stem)
        except Exception:
            pass

    # Check for archived conversation markdown files
    archived_conversations: list[str] = []
    try:
        with central_db() as conn:
            row = conn.execute(
                "SELECT folder FROM agent_groups WHERE id=?", (agent_group_id,)
            ).fetchone()
            if row:
                conv_dir = (
                    Path(settings.nanoclaw_root) / "groups" / row["folder"] / "conversations"
                )
                if conv_dir.exists():
                    archived_conversations = [
                        p.name for p in sorted(conv_dir.iterdir()) if p.suffix == ".md"
                    ]
    except Exception:
        pass

    return {
        "sdk_session_id": sdk_session_id,
        "current_jsonl": current_jsonl,
        "entries": entries,
        "archived_jsonl": archived_jsonl,
        "archived_conversations": archived_conversations,
    }
