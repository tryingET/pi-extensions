#!/usr/bin/python3
# Scripted private peer, NOT native AK claimability/database/effect proof.
import socket, struct, json, fcntl, datetime
for fd in (0,1): fcntl.fcntl(fd,fcntl.F_SETFD,fcntl.FD_CLOEXEC)
s=socket.socket(fileno=0)
def read(n):
    b=b''
    while len(b)<n:
        x=s.recv(n-len(b))
        if not x: raise ValueError('eof')
        b+=x
    return b
r=json.loads(read(struct.unpack('>I',read(4))[0]));a=r['admission']
now=datetime.datetime.now(datetime.timezone.utc)
body={'outcome':'ADMITTED','baseline_digest':a['baseline_digest'],'readback_digest':'a'*64,'claim':{'task_id':a['task_id'],'repo':a['repo'],'version':2,'claimed_by':a['actor'],'claimed_at':now.isoformat(),'lease_expires_at':(now+datetime.timedelta(seconds=a['lease_seconds'])).isoformat()},'effects':'committed_verified','reason':'native_claim_verified','accounting':{'task_version_before':1,'task_version_after':2,'restored_evidence_attachments_preserved':True,'expired_deferrals':[],'governance_receipt_ids':['1'],'event_ids':['1']}}
b=json.dumps(body,sort_keys=True,separators=(',',':')).encode();s.sendall(struct.pack('>I',len(b))+b)
