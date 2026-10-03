import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localOnly } from '../lib/security';
process.env.LOCAL_DEMO='true';
test('same origin uses actual validated host rather than Next normalized URL',()=>{
  const request=new Request('http://localhost:3001/api/checkout',{method:'POST',headers:{Host:'127.0.0.1:3001',Origin:'http://127.0.0.1:3001'}});
  assert.doesNotThrow(()=>localOnly(request,true));
});
test('local mutations reject external origins and remote hosts',()=>{
  assert.throws(()=>localOnly(new Request('http://localhost:3001/api/checkout',{method:'POST',headers:{Host:'localhost:3001',Origin:'https://evil.example'}}),true));
  assert.throws(()=>localOnly(new Request('http://localhost:3001/api/checkout',{headers:{Host:'evil.example'}})));
});
test('local APIs fail closed in production even with LOCAL_DEMO enabled',()=>{
  const env=process.env as Record<string,string|undefined>;const previous=env.NODE_ENV;env.NODE_ENV='production';
  try{assert.throws(()=>localOnly(new Request('http://localhost:3000/api/orders/abc')));}finally{if(previous===undefined)delete env.NODE_ENV;else env.NODE_ENV=previous;}
});
