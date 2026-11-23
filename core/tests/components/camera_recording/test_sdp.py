"""Tests for reshaping live offers for cameras with strict offer rules."""

from homeassistant.components.camera_recording.sdp import (
    has_ice_credentials,
    prepare_offer,
    restore_answer,
)

RECORDER_OFFER = (
    "v=0\r\n"
    "o=- 1 2 IN IP4 0.0.0.0\r\n"
    "s=-\r\n"
    "t=0 0\r\n"
    "a=group:BUNDLE 0 1\r\n"
    "m=video 9 UDP/TLS/RTP/SAVPF 96\r\n"
    "c=IN IP4 0.0.0.0\r\n"
    "a=ice-ufrag:recv\r\n"
    "a=ice-pwd:recvpassword\r\n"
    "a=fingerprint:sha-256 AA\r\n"
    "a=setup:actpass\r\n"
    "a=mid:0\r\n"
    "a=recvonly\r\n"
    "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
    "c=IN IP4 0.0.0.0\r\n"
    "a=ice-ufrag:recv\r\n"
    "a=ice-pwd:recvpassword\r\n"
    "a=fingerprint:sha-256 AA\r\n"
    "a=setup:actpass\r\n"
    "a=mid:1\r\n"
    "a=recvonly\r\n"
)


def _media(sdp: str) -> list[str]:
    return [line for line in sdp.split("\r\n") if line.startswith("m=")]


def test_offer_is_ordered_and_gains_a_data_channel() -> None:
    """The offer becomes audio, video, data channel, bundled together."""
    offer, plan = prepare_offer(RECORDER_OFFER, needs_data_channel=True)

    assert [line.split(" ")[0] for line in _media(offer)] == [
        "m=audio",
        "m=video",
        "m=application",
    ]
    assert "a=group:BUNDLE 1 0 2\r\n" in offer
    assert "a=sctp-port:5000\r\n" in offer
    assert offer.count("a=ice-ufrag:recv") == 3
    assert plan.order == [1, 0, None]
    assert plan.added_mid == "2"


def test_answer_returns_to_the_recorder_shape() -> None:
    """The answer drops the added data channel and restores the original order."""
    _, plan = prepare_offer(RECORDER_OFFER, needs_data_channel=True)
    camera_answer = (
        "v=0\r\n"
        "o=- 9 2 IN IP4 0.0.0.0\r\n"
        "s=-\r\n"
        "t=0 0\r\n"
        "a=group:BUNDLE 1 0 2\r\n"
        "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
        "c=IN IP4 0.0.0.0\r\n"
        "a=mid:1\r\n"
        "a=sendonly\r\n"
        "m=video 9 UDP/TLS/RTP/SAVPF 96\r\n"
        "c=IN IP4 0.0.0.0\r\n"
        "a=mid:0\r\n"
        "a=sendonly\r\n"
        "m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n"
        "c=IN IP4 0.0.0.0\r\n"
        "a=ice-ufrag:cam\r\n"
        "a=ice-pwd:campassword\r\n"
        "a=fingerprint:sha-256 BB\r\n"
        "a=setup:active\r\n"
        "a=mid:2\r\n"
    )

    answer = restore_answer(camera_answer, plan)

    assert [line.split(" ")[0] for line in _media(answer)] == ["m=video", "m=audio"]
    assert "a=group:BUNDLE 0 1\r\n" in answer
    assert "webrtc-datachannel" not in answer
    assert answer.count("a=ice-ufrag:cam") == 2
    assert answer.index("c=IN IP4") < answer.index("a=ice-ufrag:cam")
    assert has_ice_credentials(answer)


def test_answer_with_unexpected_sections_is_left_alone() -> None:
    """An answer that does not match the plan is passed through unchanged."""
    _, plan = prepare_offer(RECORDER_OFFER, needs_data_channel=True)
    answer = "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=mid:0\r\n"

    assert restore_answer(answer, plan) == answer
    assert not has_ice_credentials(answer)
