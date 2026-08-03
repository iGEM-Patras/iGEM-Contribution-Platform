# Part 5 — Admin approval emails

When a team submits a game, `igem@upatras.gr` gets an email with the submission
details and two buttons. Clicking one opens a confirmation page; confirming
writes `Approved` or `Rejected` back to Airtable, which is what Part 6's public
gallery reads.

---

## Why this isn't pure Zapier

The original plan was "Zapier free tier, no code". That combination cannot
produce working buttons, for three separate reasons:

| Needed | Zapier Free |
|---|---|
| A URL that Zapier catches when the admin clicks APPROVE | **Webhooks by Zapier is a premium app** — Starter and up |
| Trigger → catch webhook → update Airtable | Free is **two-step only** (1 trigger + 1 action) |
| Email arrives within 2 minutes | Free polls Airtable every **15 minutes** |

So the buttons point at the Cloudflare Worker instead. The Worker already holds
the Airtable token and already updates statuses, so this is two new routes on a
service you already run, at no cost and with no polling delay.

Zapier still sends the email. That part genuinely fits the free tier.

**The 15-minute delay is real** and Zapier free cannot fix it. If it bothers
you, skip Zapier entirely and use the Airtable-native automation in
[Appendix A](#appendix-a--airtable-native-email-no-zapier) — same email, fires
in seconds, also free. The buttons work identically either way.

---

## Step 1 — Add three fields in Airtable

Open the base and add these to the same table the form writes to. Names are
**case-sensitive** and must match exactly; the Worker deliberately runs with
Airtable's `typecast` off, so a mismatch fails loudly instead of silently
inventing a column.

| Field name | Type |
|---|---|
| `Approve URL` | URL |
| `Reject URL` | URL |
| `Decided At` | Date (enable "Include a time field") |

Skipping this is the single most likely setup mistake. The symptom is exact:
clicking a button shows "Could not complete this", and `npx wrangler tail`
prints `UNKNOWN_FIELD_NAME: "Decided At"`.

## Step 2 — Create a "Pending Review" view

Still in Airtable: **Create view → Grid**, name it `Pending Review`, add filter
`Status is Pending`.

Zapier's Airtable trigger watches a view, not a whole table. Pointing it at this
view is what makes the Zap fire only for new pending submissions — it is the
"Status = Pending" condition from the requirements, expressed the way Zapier
actually supports on the free tier.

## Step 3 — Give the Worker a signing secret

The approve/reject links carry an HMAC so that only links the Worker itself
generated are accepted. Generate a key and store it:

```bash
cd worker
openssl rand -base64 32            # copy the output
npx wrangler secret put DECISION_SECRET
```

Paste the value when prompted. Add it to `worker/.dev.vars` too if you want the
flow to work under `npm run dev --prefix worker`.

**This is intentionally not `ADMIN_SECRET`.** These links travel through email,
mail servers, and browser history. If the signing key were also the dashboard
password, one forwarded email would hand over the whole admin surface. Keep them
separate. Rotating `DECISION_SECRET` instantly voids every link already sent,
which is your emergency exit if the admin mailbox is ever compromised.

## Step 4 — Deploy the Worker

```bash
npm run deploy --prefix worker
```

Confirm it is live:

```bash
curl https://igem-gallery-api.igem-patras.workers.dev/health
# {"ok":true,"service":"igem-gallery-api"}
```

From now on, every new submission gets its `Approve URL` and `Reject URL` cells
filled in automatically. Rows created *before* this deploy will have those cells
empty — see [Recovering links](#recovering-links-for-old-rows) below.

## Step 5 — Build the Zap

Zapier → **Create Zap**.

**Trigger**
1. App: **Airtable**, Event: **New Record in View**
2. Connect your Airtable account (Zapier will ask for base access)
3. Base: your gallery base · Table: your submissions table · View: **Pending Review**
4. **Test trigger** — it should pull a real pending row. If the base is empty,
   submit a throwaway entry through the form first, or Zapier has no sample
   fields to map in the next step and every token comes out blank.

**Action**
1. App: **Gmail**, Event: **Send Email** — use this if `igem@upatras.gr` is
   Google Workspace. If it is not, use **Email by Zapier → Send Outbound Email**
   instead; it is built-in, free, and also supports an HTML body. (Its downside
   is that mail arrives from a Zapier address, so add it to your allow-list.)
2. **To:** `igem@upatras.gr`
3. **Subject:** `New Game Upload: ` then insert the **Team Name** field, then
   ` - Review needed`
4. **Body Type:** `html` ← easy to miss, and the whole template renders as raw
   angle brackets if you leave it on plain
5. **Body:** paste all of [`docs/admin-review-email.html`](admin-review-email.html),
   then replace each `{{TOKEN}}` by selecting the matching field from Zapier's
   dropdown. The mapping is listed in the comment at the top of that file.
   Typing `{{TEAM_NAME}}` literally does nothing — Zapier only substitutes
   references it inserted itself.
6. **Test action**, then **Publish**.

That is one trigger and one action: exactly the two steps the free tier allows.

---

## Recovering links for old rows

Rows that predate Step 4 have empty URL cells, and rotating `DECISION_SECRET`
stales every stored link. The admin endpoint re-signs on demand, so it is always
the authoritative source:

```bash
curl -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
  https://igem-gallery-api.igem-patras.workers.dev/admin/submissions
```

Every submission in the response carries a fresh `decisionLinks.approve` and
`decisionLinks.reject`. Paste either into a browser.

---

## Optional — email the team on a decision

Airtable automations handle this natively, free, with no Zapier tasks consumed.
Base → **Automations → Create automation**:

**Approved**
- Trigger: **When record matches conditions** → `Status` is `Approved`
- Action: **Send email** → To: the `Email` field → e.g.
  *"Your game is now live in the iGEM Game Gallery. Reference: {Verification Code}"*

**Rejected**
- Same, with `Status` is `Rejected`, and wording that invites a resubmission.

Use **"When record matches conditions"**, not "When record updated". The former
only fires on entering the state; the latter fires on every edit, so hand-editing
an approved row would re-send the congratulations email.

The Airtable free plan includes 100 automation runs per month, shared across all
automations in the base.

`Decided At` is filled in by the Worker on every confirmed decision, so the
approval timestamp from the nice-to-have list is already covered.

---

## Testing

Run these in order. Steps 1–4 need no Airtable edits beyond Step 1 above.

- [ ] **Submit a game** through the live form using a team name like
      `ZZ Test — delete me` so it is obvious in the base later.
- [ ] **Check Airtable**: a new row exists, `Status` is `Pending`, and both
      `Approve URL` and `Reject URL` are populated. If the URLs are empty,
      the Worker deploy in Step 4 did not take — check `wrangler tail`.
- [ ] **Wait for the email** at `igem@upatras.gr`. Up to 15 minutes on Zapier
      free; seconds with the Airtable-native version. To skip the wait during
      testing, hit **Run Zap** manually in the Zapier editor.
- [ ] **Read the email**: team name, submitter address, Instagram link,
      verification code, PDF link and image preview all present and correct.
- [ ] **Click APPROVE** → a confirmation page opens showing the team name and
      current status. Nothing has changed in Airtable yet — verify that.
- [ ] **Confirm** → page says Approved; the Airtable row flips to `Approved`
      and `Decided At` fills in.
- [ ] **Check `/approved`**: `curl .../approved` now lists the game.
- [ ] **Submit a second test entry, click REJECT**, confirm → row reads
      `Rejected` and the game is absent from `/approved`.
- [ ] **Delete both test rows** from Airtable.

Security checks worth doing once, since these links are the only thing standing
between the public and your approval flow:

- [ ] Change one character of the token in an approve URL → **403, "This link is
      not valid"**.
- [ ] Take a valid approve URL and change `action=approve` to `action=reject`
      → **403**. The action is inside the signature, so it cannot be swapped.

---

## Troubleshooting

**"Could not complete this" when confirming, `wrangler tail` shows
`UNKNOWN_FIELD_NAME`.**
A field from Step 1 is missing or misspelled. The log names the exact field.
Nothing was written — Airtable rejects the whole PATCH atomically.

**"This link is not valid. It may have been altered in transit." (403)**
Either the link was truncated by the mail client (long URLs sometimes wrap —
copy the whole thing into the address bar), or `DECISION_SECRET` was rotated
after the email was sent. Re-sign via `/admin/submissions`.

**"DECISION_SECRET is not configured on the server." (500)**
Step 3 was skipped, or the secret was set but the Worker has not been redeployed
since. Run `npx wrangler secret list --config worker/wrangler.toml` to confirm.

**Approve URL / Reject URL cells stay empty on new submissions.**
The Worker writes them in a second call right after creating the row, and logs
`could not attach decision links` if that call fails. This never blocks the
submission itself — the team still gets their code. Check `wrangler tail`; the
usual cause is the Step 1 fields missing.

**Email never arrives.**
In order: is the Zap **published** (not just saved)? Check Zapier's **Zap
History** for a failed run. Has the free tier's 100 tasks/month been used up?
Is the row actually in the `Pending Review` view — a row whose `Status` is not
exactly `Pending` never enters the view and never triggers.

**Email arrives with raw HTML tags visible.**
Body Type is on `plain`. Set it to `html` (Step 5.4).

**Email arrives but fields are blank.**
The `{{TOKEN}}` placeholders were typed rather than inserted from Zapier's field
picker. Re-do them via the dropdown.

**Clicking a button does nothing / browser can't reach the page.**
The link points at `127.0.0.1` — the Zap was tested against a locally-running
Worker. Links are built from the hostname the request arrived on, so re-deploy
and submit a fresh entry to get production URLs.

**A status changed without anyone clicking.**
Mail-scanner prefetch is the usual suspect, but it should not be possible here:
the GET only renders a page, and the write is behind a POST that scanners do not
issue. If you see this, check who else has Airtable base access before assuming
the links leaked.
