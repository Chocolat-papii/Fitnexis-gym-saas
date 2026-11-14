import nodemailer from 'nodemailer';
export const emailDelivery={
  async sendCode(email,code,purpose) {
    const {SMTP_HOST,SMTP_USER,SMTP_PASSWORD,MAIL_FROM}=process.env;
    if(!SMTP_HOST||!MAIL_FROM)throw Object.assign(new Error('Email sign-in is unavailable. Configure SMTP_HOST and MAIL_FROM.'),{status:503});
    const port=Number(process.env.SMTP_PORT||587);
    const transport=nodemailer.createTransport({host:SMTP_HOST,port,secure:port===465,requireTLS:port!==465,
      auth:SMTP_USER?{user:SMTP_USER,pass:SMTP_PASSWORD}:undefined,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
    try {await transport.sendMail({from:MAIL_FROM,to:email,subject:'Your Fitnexis verification code',
      text:`Your Fitnexis ${purpose==='reauth'?'identity confirmation':'sign-in'} code is ${code}.\n\nIt expires in five minutes and can only be used once. If you did not request this code, ignore this email.`});
    }catch{throw Object.assign(new Error('We could not send your verification email. Please try signing in again shortly.'),{status:503});}
    finally{transport.close();}
  }
};
