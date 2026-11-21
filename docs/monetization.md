# Monetisation (short version)

Plan only, nothing built. 2026-11-22. **Not legal advice. A lawyer must review sections 3 and 5 before any ad, payment or sign-up goes live.**

## 1. Charge and never charge
- Charge: **Pro, lifetime, 500 INR once**. Removes ads. No gameplay advantage. Price shown tax included, "one time, no subscription".
- Never charge for: deities or sacred figures, loot boxes or random rewards, skipping or unlocking levels, buying rank, items that change play, anything that undermines the climb to Kalki (decisions 13 and 14).
- Pro offer never shows during a mission or on a sacred intro screen.

## 2. Ad rules
- 10 s ad at app open, countdown shown, skippable only after the timer.
- Then at most once per N completed levels (start N = 3, tune later). Never after a failed level.
- Never during a mission or on a mission title card. No ads on sacred-content intro screens.
- Skip button 44 px or more, named for screen readers, visible focus. Reduced motion respected. No sound without mute; audio needs captions.
- Blocklist: alcohol, meat, gambling, dating, adult, religion-mocking. Set by network category, then sample by hand. "Report this ad" link on every ad.
- Pro removes all ads.

## 3. Consent and privacy outline (India, DPDP Act 2023)
Law, checked 2026-11-22:
- Rules notified 13 Nov 2025 ([LiveLaw](https://www.livelaw.in/amp/top-stories/digital-personal-data-protection-rules-2025-notified-309928)). Rules 3 and 5 to 16 (notice, children, breach, retention) start 18 months after publication, about 13 May 2027 ([SCC Online](https://www.scconline.com/blog/post/2025/12/26/digital-personal-data-protection-rules-2025-key-highlights/), [Bar and Bench](https://www.barandbench.com/view-point/meity-notifies-final-digital-personal-data-protection-rules-2025)). MeitY proposed cutting this to 12 months; reported as not final in April 2026 ([Mondaq](https://www.mondaq.com/india/data-protection/1773554/meity-plans-to-cut-short-dpdp-compliance-timeline-and-notify-cross-border-restrictions-for-sdfs)). I could not confirm a final change.
- A child is under 18. Verifiable parent or guardian consent is needed first. No tracking, behavioural monitoring or targeted ads at children. Penalties for children's-data breaches go up to 200 crore rupees ([Act text, ss. 2(f), 9, 33](https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf)).
- Notice must be clear, separate, say what data and why, give contact, and how to withdraw or complain (Rule 3, SCC Online above).

Our approach:
1. No account, email or phone. Traveller choice stays in the browser.
2. No tracking or profiles. Anonymous totals only.
3. Contextual, non-personalised ads for everyone; ad network must offer a child-directed setting. If none qualifies, launch without ads.
4. Pro purchase: gateway holds payer data; we keep an order ID and a Pro flag. Buyer must be an adult or guardian.

Consent screen draft (reading age about 12, fits 360 px, buttons 44 px or more, text not colour):
> **Before you play.** Dharmastra shows ads to keep the game free. Ads are not matched to you. We make no profile of you. We do not ask for your name or email. We do not sell your data.
> Are you 18 or older, or is a grown-up with you?
> [Yes, I am 18+ or a grown-up is with me] [No, I am under 18 and alone]
> Privacy notice (link). You can change this in Settings.

"No" means the game with no ads. This is self-declaration, not verifiable consent; the lawyer must say if it suffices.

Privacy notice outline: who we are and contact; what is collected and by whom (table); why; children; ads; payments; how long kept and how to delete; your rights; breach; how to complain; change log.
Refund and support outline: 7-day no-questions refund (lawyer to set final terms), one support email answered in 3 working days, restore Pro via order ID, grievance contact shown, parent refund for accidental child purchase.

## 4. Sacred content and first pay test (brief)
- Every History or Tradition event gets two named sources, plus review by a scholar (History) or pandit (Tradition) before public launch. Reviews recorded in docs/review/. "Report a mistake" link on each event intro, reply within 3 working days, public corrections log, serious reports hidden within 48 hours.
- Pay test: after level 1, a fake-door card "Pro, 500 INR once, removes ads, coming soon" with optional waitlist (adults only) for 100 to 200 players. My starting thresholds, not research: 5 percent tap and 2 percent waitlist is a signal; under 1 percent means rethink. Then a real link to the waitlist; 10 percent buying in 14 days counts. Small sample, direction only.

## 5. CEO creates these himself, in order (effort is my estimate)
1. Legal entity details (PAN, address, GST status): 1 to 3 h; company registration, if needed, days to weeks.
2. Lawyer, briefed with section 6: 2 to 4 h to find and brief.
3. Domain: 1 h.
4. Hosting (GitHub Pages now; a small server later for Pro checks): 1 to 2 h.
5. Business and grievance email: 1 h.
6. Payment gateway (KYC, needs live site and policies): 2 to 4 h, approval about 1 to 2 weeks.
7. Ad network (site review, child-directed and category-block settings): 2 to 3 h, review about 1 to 2 weeks.
8. Scholar and pandit introductions: 2 to 4 h.
Never put keys or payout details in the repo.

## 6. Open questions
1. Which DPDP date applies on launch day?
2. Are contextual ads for all enough under s. 9(3)? Which network setting counts?
3. Is the 18+ self-declaration enough, or is verifiable parental consent needed, including for the 500 INR purchase?
4. Any s. 9(4) exemption? Is the ad network a processor or separate fiduciary?
5. Refund terms, GST on a digital good, grievance officer rules.
6. Pro entitlement without a server: principal engineer to design.
7. Reviewer budget.

Not tested: nothing is built; ad blocklist and consent wording not tested on a device or with a 12-year-old. I did not read the Rules' gazette text.
