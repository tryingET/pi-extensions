"""Erasure recovery for small SHA-bound bundles; not an authenticity mechanism."""
import base64, hashlib, re, zlib
EXP = [0]*512
LOG = [0]*256
x = 1
for i in range(255):
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if x & 256:
        x ^= 0x11d
for i in range(255, 512):
    EXP[i] = EXP[i-255]
def mul(a,b):
    return EXP[LOG[a]+LOG[b]] if a and b else 0
def inv(a):
    assert a
    return EXP[255-LOG[a]]
def crc(data):
    return f'{zlib.crc32(data):08x}'
def recover(data, directory):
    length = data['base64Length']
    size = 256
    assert 0 < length <= 32768
    n = (length+size-1)//size
    chunks = []
    for part in data['parts']:
        assert re.fullmatch(r'[0-9]{2}-[a-z0-9-]+\.txt', part)
        p = directory/part
        assert p.stat().st_size < 30000
        chunks += p.read_text().splitlines()
    assert len(chunks) == n
    rows = []
    for i,line in enumerate(chunks):
        raw = line[9:].encode()
        want = min(size, length-i*size)
        valid = len(raw) == want and line[8:9] == ':' and crc(raw) == line[:8]
        rows.append(bytearray(raw.ljust(size,b'\0')) if valid else None)
    missing = [i for i,row in enumerate(rows) if row is None]
    equations = []
    seen = set()
    for part in data['recoveryParts']:
        assert re.fullmatch(r'[0-9]{2}-[a-z0-9-]+\.txt', part)
        p = directory/part
        assert p.stat().st_size < 30000
        for line in p.read_text().splitlines():
            try:
                ident, check, text = line.split(':', 2)
                j = int(ident)
                raw = base64.b64decode(text, validate=True)
                if not 0 <= j < 128 or j in seen or len(raw) != size or crc(raw) != check:
                    continue
                seen.add(j)
                v = bytearray(raw)
                for i,row in enumerate(rows):
                    if row is not None:
                        a = inv(i^(128+j))
                        for k,b in enumerate(row):
                            v[k] ^= mul(a,b)
                equations.append(([inv(i^(128+j)) for i in missing],v))
            except (ValueError, AssertionError):
                continue
    assert len(equations) >= len(missing), f'{len(missing)} missing blocks, {len(equations)} valid parity rows'
    equations = equations[:len(missing)]
    for col in range(len(missing)):
        pivot = next(i for i in range(col,len(missing)) if equations[i][0][col])
        equations[col], equations[pivot] = equations[pivot], equations[col]
        a,v = equations[col]
        factor = inv(a[col])
        a[:] = [mul(b,factor) for b in a]
        v[:] = bytes(mul(b,factor) for b in v)
        for i,(other,value) in enumerate(equations):
            if i == col:
                continue
            factor = other[col]
            for k in range(len(other)):
                other[k] ^= mul(factor,a[k])
            for k in range(size):
                value[k] ^= mul(factor,v[k])
    for i,(_,row) in zip(missing,equations):
        rows[i] = row
    encoded = b''.join(rows)[:length]
    blob = base64.b64decode(encoded, validate=True)
    assert hashlib.sha256(blob).hexdigest() == data['sha256'], 'Full SHA-256 mismatch'
    print('Recovered transport erasures:', missing)
    return blob
