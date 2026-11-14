# Email sign-in

Password sign-in sends a six-digit code to the account's email address. Authenticator apps and QR setup are no longer required. This applies to platform administrators, gym staff, and members. Google sign-in has been removed.

## Use Gmail without owning a domain

You do not need a custom domain or a public website to send codes. The app can run on localhost and send through a Gmail mailbox. You still need a mail account and permission to send from it.

1. Choose the Gmail mailbox that will send Fitnexis codes.
2. Enable [2-Step Verification](https://support.google.com/accounts/answer/185839) on that account.
3. Create an [App Password](https://myaccount.google.com/apppasswords) for Fitnexis. Use this app password, not your normal Gmail password. App Passwords may be unavailable under some account or organization policies; see [Google's eligibility guidance](https://support.google.com/accounts/answer/185833).
4. Add the following to your local `.env`, replacing the example address and password:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-address@gmail.com
SMTP_PASSWORD=your-16-character-app-password
MAIL_FROM="Fitnexis <your-address@gmail.com>"
```

Use the same Gmail address for `SMTP_USER` and `MAIL_FROM`. Enter the app password without the display spaces. Do not share or commit this credential.

5. Run `npm.cmd run migrate`, then restart the server with `npm.cmd start` (or your usual development command).
6. Sign in using your Fitnexis account email and password. The code is sent to that account email, which can differ from the sending Gmail address. Check the recipient's spam folder if necessary.

This SMTP connection is only for sending email; users do not sign in to Fitnexis with Google.

## Other email providers

You can use another SMTP provider with its host, port, credentials and authorized sender address. Port 587 requires STARTTLS; port 465 uses TLS immediately. A custom sender domain is only needed when your chosen provider requires one. Keep your existing `JWT_SECRET` and `SECURITY_ENCRYPTION_KEY`.

Codes are never printed to the console or returned by the API. Missing SMTP configuration or failed delivery blocks sign-in rather than bypassing verification. The error "Email sign-in is unavailable. Configure SMTP_HOST and MAIL_FROM." means the sending mailbox has not been configured; it is unrelated to Google sign-in.

## Sensitive changes

In gym settings or platform identity confirmation, select **Send confirmation code**, then submit your password and the emailed code. This grants five minutes to complete sensitive changes. Confirmation codes cannot be used as sign-in codes or for another account. Codes expire after five minutes, allow five attempts, and work once. Wait one minute between code requests; resending invalidates the previous code.

The email-code issuance cooldown is enforced in PostgreSQL across server processes. Existing IP rate limiting remains process-local; use shared gateway rate limiting for a production cluster. Protect administrator mailboxes. Automated password recovery is outside this change.

## Database cleanup

The latest migration removes the former Google login request table. Historical migrations retain their original schema definitions so existing installations can migrate and roll back consistently. No Google sign-in routes, buttons, OAuth credentials or authentication library are used by the application.

References: [Gmail SMTP](https://developers.google.com/workspace/gmail/imap/imap-smtp), [Nodemailer Gmail setup](https://nodemailer.com/guides/using-gmail).
