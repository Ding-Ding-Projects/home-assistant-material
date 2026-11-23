"""Reshape a recorder's SDP offer for cameras with stricter offer rules.

Some cloud cameras, such as Nest, only accept an offer whose media sections come
in the order audio, video, data channel, and that includes a data channel. The
recorder's offer has its own order and no data channel. The offer is reshaped
before it reaches the camera, and the answer is mapped back to the original
shape, so the recorder sees an answer that matches its own offer.
"""

from dataclasses import dataclass

_KIND_ORDER = {"audio": 0, "video": 1}
_TRANSPORT_PREFIXES = (
    "a=ice-ufrag:",
    "a=ice-pwd:",
    "a=ice-options:",
    "a=fingerprint:",
    "a=setup:",
)


@dataclass(slots=True)
class _Sdp:
    header: list[str]
    sections: list[list[str]]


@dataclass(slots=True)
class OfferPlan:
    """How the camera's answer maps back onto the original offer."""

    order: list[int | None]
    added_mid: str | None


def _parse(sdp: str) -> _Sdp:
    lines = [line for line in sdp.replace("\r\n", "\n").split("\n") if line != ""]
    header: list[str] = []
    sections: list[list[str]] = []
    for line in lines:
        if line.startswith("m="):
            sections.append([line])
        elif sections:
            sections[-1].append(line)
        else:
            header.append(line)
    return _Sdp(header, sections)


def _render(sdp: _Sdp) -> str:
    lines = [*sdp.header, *(line for section in sdp.sections for line in section)]
    return "\r\n".join(lines) + "\r\n"


def _kind(section: list[str]) -> str:
    return section[0][2:].split(" ", 1)[0]


def _mid(section: list[str]) -> str | None:
    for line in section:
        if line.startswith("a=mid:"):
            return line[6:]
    return None


def _transport(lines: list[str]) -> list[str]:
    return [line for line in lines if line.startswith(_TRANSPORT_PREFIXES)]


def _rewrite_bundle(header: list[str], mids: list[str]) -> list[str]:
    return [
        "a=group:BUNDLE " + " ".join(mids)
        if line.startswith("a=group:BUNDLE")
        else line
        for line in header
    ]


def has_ice_credentials(sdp: str) -> bool:
    """Whether an SDP carries an ICE username fragment anywhere."""
    return "a=ice-ufrag:" in sdp


def prepare_offer(offer: str, *, needs_data_channel: bool) -> tuple[str, OfferPlan]:
    """Order the offer audio, video, others, and add a data channel if needed."""
    parsed = _parse(offer)
    indexed = list(enumerate(parsed.sections))
    indexed.sort(key=lambda item: _KIND_ORDER.get(_kind(item[1]), 2))
    order: list[int | None] = [index for index, _ in indexed]
    sections = [section for _, section in indexed]
    added_mid: str | None = None
    if needs_data_channel and not any(
        _kind(section) == "application" for section in sections
    ):
        used = {mid for section in sections if (mid := _mid(section)) is not None}
        added_mid = next(str(n) for n in range(len(used) + 1) if str(n) not in used)
        source = _transport(sections[0]) if sections else []
        if not source:
            source = _transport(parsed.header)
        sections.append(
            [
                "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
                "c=IN IP4 0.0.0.0",
                *source,
                f"a=mid:{added_mid}",
                "a=sctp-port:5000",
            ]
        )
        order.append(None)
    mids = [mid for section in sections if (mid := _mid(section)) is not None]
    header = parsed.header
    if any(line.startswith("a=group:BUNDLE") for line in header):
        header = _rewrite_bundle(header, mids)
    return _render(_Sdp(header, sections)), OfferPlan(order, added_mid)


def restore_answer(answer: str, plan: OfferPlan) -> str:
    """Map the camera's answer back onto the original offer's shape."""
    parsed = _parse(answer)
    if len(parsed.sections) != len(plan.order):
        return answer
    kept: dict[int, list[str]] = {}
    dropped: list[list[str]] = []
    for section, original in zip(parsed.sections, plan.order, strict=True):
        if original is None:
            dropped.append(section)
        else:
            kept[original] = section
    sections = [kept[index] for index in sorted(kept)]
    shared = _transport(parsed.header)
    for section in dropped:
        for line in _transport(section):
            prefix = line.split(":", 1)[0]
            if not any(item.startswith(prefix) for item in shared):
                shared.append(line)
    for section in sections:
        missing = [
            line
            for line in shared
            if not any(item.startswith(line.split(":", 1)[0]) for item in section)
        ]
        at = next(
            (i for i, line in enumerate(section) if i and line.startswith("a=")),
            len(section),
        )
        section[at:at] = missing
    header = parsed.header
    if plan.added_mid is not None:
        mids = [mid for section in sections if (mid := _mid(section)) is not None]
        if any(line.startswith("a=group:BUNDLE") for line in header):
            header = _rewrite_bundle(header, mids)
    return _render(_Sdp(header, sections))
