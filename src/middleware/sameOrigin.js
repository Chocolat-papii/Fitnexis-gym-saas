export function sameOrigin(req,res,next) {
  const origin=req.get('origin');
  if(origin){try{if(new URL(origin).host!==req.get('host'))return res.status(403).json({error:'Cross-site account requests are not allowed.'});}catch{return res.sendStatus(403);}}
  if(req.get('sec-fetch-site')==='cross-site')return res.sendStatus(403);
  next();
}
