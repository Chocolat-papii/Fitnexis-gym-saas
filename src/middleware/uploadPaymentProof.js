import multer from 'multer';
import {MAX_PROOF_BYTES,PROOF_MIMES} from '../services/paymentProofStorage.service.js';
const parse=multer({storage:multer.memoryStorage(),limits:{files:1,fileSize:MAX_PROOF_BYTES,fields:10,parts:12,fieldSize:4096},fileFilter:(req,file,done)=>done(PROOF_MIMES.includes(file.mimetype)?null:new Error('Unsupported document'),PROOF_MIMES.includes(file.mimetype))}).single('proof');
export function uploadPaymentProof(req,res,next){parse(req,res,error=>error?res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:'Choose one PDF, JPG or PNG up to 5 MB'}):next());}
