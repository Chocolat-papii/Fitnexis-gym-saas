const buckets=new Map();
export const rateLimit=(name,limit=10,minutes=15)=>(req,res,next)=>{
  const now=Date.now();for(const [key,bucket]of buckets)if(bucket.until<=now)buckets.delete(key);
  const key=`${name}:${req.ip}`;const bucket=buckets.get(key)||{count:0,until:now+minutes*60000};
  if(bucket.count>=limit){res.set('Retry-After',String(Math.ceil((bucket.until-now)/1000)));return res.status(429).json({error:'Too many attempts. Please try again later.'});}
  bucket.count++;buckets.set(key,bucket);next();
};
