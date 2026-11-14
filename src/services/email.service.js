export function createEmailDelivery({ env = process.env, fetch: request = globalThis.fetch } = {}) {
  async function send({ to, subject, text, messageId }) {
    const { RESEND_API_KEY, RESEND_FROM } = env;
    if (!RESEND_API_KEY || !RESEND_FROM) {
      throw Object.assign(new Error('Email delivery is unavailable. Configure RESEND_API_KEY and RESEND_FROM.'), { status: 503 });
    }
    try {
      const response = await request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + RESEND_API_KEY,
          'Content-Type': 'application/json',
          ...(messageId ? { 'Idempotency-Key': messageId } : {}),
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, text }),
      });
      if (!response.ok || !(await response.json()).id) throw new Error('Email provider rejected delivery.');
    } catch {
      // Provider responses may contain recipients or message contents. Never log them.
      throw Object.assign(new Error('We could not send your email. Please try again shortly.'), { status: 503 });
    }
  }
  return {
    sendMessage: send,
    async sendCode(email, code, purpose) {
      await send({
        to: email,
        subject: 'Your Fitnexis verification code',
        text: 'Your Fitnexis ' + (purpose === 'reauth' ? 'identity confirmation' : 'sign-in') + ' code is ' + code + '.\n\nIt expires in five minutes and can only be used once. If you did not request this code, ignore this email.',
      });
    },
  };
}

export const emailDelivery = createEmailDelivery();
