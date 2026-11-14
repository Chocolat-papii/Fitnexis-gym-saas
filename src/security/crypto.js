import {createCipheriv,createDecipheriv,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

function encryptionKey() {
  const key = Buffer.from(process.env.SECURITY_ENCRYPTION_KEY || '', 'base64');
  if(key.length !== 32) throw Object.assign(new Error('Set SECURITY_ENCRYPTION_KEY to a base64-encoded 32-byte key'),{status:503});
  return key;
}
export function encryptSecret(value, context) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  cipher.setAAD(Buffer.from(context));
  return ['v1',iv.toString('base64'),Buffer.concat([cipher.update(value,'utf8'),cipher.final()]).toString('base64'),cipher.getAuthTag().toString('base64')].join('.');
}
export function decryptSecret(value, context) {
  const [version,iv,data,tag]=String(value).split('.');
  if(version!=='v1') throw new Error('Invalid encrypted secret');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64'));
  decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data,'base64')),decipher.final()]).toString('utf8');
}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) {
  let bits=0,value=0,out='';
  for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value >>> (bits-5))&31];bits-=5;}}
  if(bits)out+=alphabet[(value<<(5-bits))&31];return out;
}
function decode32(value) {
  let bits=0,n=0,out=[];for(const char of value){const d=alphabet.indexOf(char);if(d<0)throw new Error('Invalid base32 secret');n=(n<<5)|d;bits+=5;if(bits>=8){out.push((n>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);
}
export const newTotpSecret = () => base32(randomBytes(20));
export function totp(secret, counter, digits=6) {
  const bytes=Buffer.alloc(8);bytes.writeBigUInt64BE(BigInt(counter));
  const hash=createHmac('sha1',decode32(secret)).update(bytes).digest();const offset=hash.at(-1)&15;
  return String((hash.readUInt32BE(offset)&0x7fffffff)%10**digits).padStart(digits,'0');
}
export function totpCounter(secret, code, now=Date.now(), lastCounter=-1) {
  if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
  const current=Math.floor(now/30000);
  for(const counter of [current,current-1,current+1]) if(counter>Number(lastCounter)&&timingSafeEqual(Buffer.from(totp(secret,counter)),Buffer.from(code)))return counter;
  return null;
}
