import {randomBytes} from 'node:crypto';

export function generatePluginLicenseKey() {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let raw='',value=0,bits=0;
  for(const byte of randomBytes(20)){value=(value<<8)|byte;bits+=8;while(bits>=5){bits-=5;raw+=alphabet[(value>>>bits)&31];}}
  return `AC-LIC-${raw.match(/.{4}/g)!.join('-')}`;
}
