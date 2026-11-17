# Email sign-in

Password sign-in sends a six-digit code to the account's email address. Authenticator apps and QR setup are no longer required. This applies to platform administrators, gym staff, and members. Google sign-in has been removed.

## Resend HTTPS email delivery

Verification emails are sent using Resend's HTTPS API. This works on hosts that block outbound SMTP, including Render Free. The code uses Node's built-in `fetch`; no SMTP connection or extra email SDK is required.

1. Create a Resend account and add the sending domain `fitnexis.app` (or a dedicated email subdomain).
2. Add the exact DNS records Resend provides in Cloudflare, then wait until Resend marks the sending domain verified. Keep existing website and mailbox records unless Resend explicitly requires a change. A Gmail sender address cannot be used as the verified Fitnexis sender.
3. Create an API key with sending access for the verified domain.
4. Add these values to the local `.env` and the production host's environment settings:

```dotenv
RESEND_API_KEY=re_your_private_api_key
RESEND_FROM="Fitnexis <no-reply@fitnexis.app>"
```

Use an address belonging to the exact domain verified in Resend. Keep the API key server-side. `SMTP_*` and `MAIL_FROM` are no longer used for verification emails.

5. Restart the server and sign in using an existing Fitnexis account. The code is sent to that account's email address. Check spam if necessary. No authentication schema migration is needed for this delivery-provider change.

Requests time out after 15 seconds. Missing configuration, provider rejection, quota exhaustion or delivery-request failures block sign-in; there is no SMTP fallback or verification bypass. Existing code expiry, one-time use, account cooldown and attempt limits remain enforced. An API acceptance response does not guarantee inbox delivery; inspect Resend delivery events for delivery issues. Keep the existing `JWT_SECRET` and `SECURITY_ENCRYPTION_KEY` unchanged.

Codes, API keys and provider response bodies are not logged or returned to users. `npm test` verifies the HTTP request and failure paths without sending real emails. Watch usage against [Resend's current free-plan limits](https://resend.com/pricing).

## Sensitive changes

The same Resend HTTPS integration also sends transactional member-account notices after gym staff save profile changes, suspend/restore access, deactivate/reactivate an account, reset a password, change a plan, or pause/resume a membership. These are account/security notices, independent of optional communication preferences. Passwords, sign-in codes and private profile values are never included. Email-address changes notify both the previous and new address. Saving an unchanged profile does not send another notice.

Run `npm.cmd run migrate` after this update, then restart the server. The member change, audit entry and email queue record commit together. Email is attempted after commit. Failed sends do not undo a successful change: a worker retries automatically with backoff, up to five attempts. The worker starts with the app and does not depend on billing jobs being enabled. Resend API acceptance appears as **Sent**; it does not confirm inbox delivery. Resend deduplicates retries with a stable idempotency key for 24 hours. A retry after that window may deliver a duplicate. The worker runs while the host is awake; Render Free can delay retries while sleeping.

The gym superuser can open **Member activity** at `/admin/activity` to see who made each change, when, a summary and notification status. Only the gym superuser has access to this gym-scoped, read-only audit trail. Failed emails can be retried there after resolving delivery problems; sent emails cannot be resent through the retry button.

In gym settings or platform identity confirmation, select **Send confirmation code**, then submit your password and the emailed code. This grants five minutes to complete sensitive changes. Confirmation codes cannot be used as sign-in codes or for another account. Codes expire after five minutes, allow five attempts, and work once. Wait one minute between code requests; resending invalidates the previous code.

The email-code issuance cooldown is enforced in PostgreSQL across server processes. Existing IP rate limiting remains process-local; use shared gateway rate limiting for a production cluster. Protect administrator mailboxes. Automated password recovery is outside this change.

## Database cleanup

The latest migration removes the former Google login request table. Historical migrations retain their original schema definitions so existing installations can migrate and roll back consistently. No Google sign-in routes, buttons, OAuth credentials or authentication library are used by the application.

References: [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email), [verify a sending domain](https://resend.com/docs/dashboard/domains/introduction).
