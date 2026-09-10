# Project Log

This document is intended for the maintaining team to use to document decisions. This may be a medium for documenting, reviewing, and approving as a means of expressing consensus on project business decisions where the direct output is not necessarily code or assets that may be otherwise checked in and version controlled.

> **Example Entry (Date in ISO8601 format, Year-Month-Day):**
>
> The team agrees to _BLANK_ project business decision(s)...

---

**2026-09-10**

The team agrees that AI-assisted garment details ship opt-in and default off.

`AI_PROVIDER` defaults to `none`, and on an instance that leaves it there the
feature does not exist: no button is rendered, no privacy paragraph is shown,
and nothing is configured to talk to. Where a provider is configured, the
button names the host it would send the photo to and pressing it is the
per-use consent; nothing is ever sent automatically.

What leaves the server on a press is one downscaled JPEG of the garment, the
UI language, and the names of the categories that wardrobe already uses.
Nothing else does — not other garments' photos, not outfits, not the account.

The button is the wardrobe owner's alone. A MANAGE share lets a guest add
garments to someone else's wardrobe; it does not let them decide that its
owner's category names may be sent to a third party, so the button is absent
in a shared wardrobe and the route refuses a hand-made request. Consent for
sending someone's data has to come from that someone.

The reasoning is that this project's positioning is privacy-first and
"no GPU needed", and an AI feature that were on by default, or that sent more
than the thing being described, would contradict both. Pointing `AI_BASE_URL`
at a model on the operator's own network is a first-class option for the same
reason.

If this work is ever contributed upstream, the hosted instance must keep
`AI_PROVIDER=none` unless its privacy policy is updated to describe the above.

