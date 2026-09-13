"""Framed release: accumulate through newline, exact token=attempt+\\n. Keep fd open.
Never treat one-shot os.read(0, 4096) as a message. EOF/partial/oversize/deadline fail.
"""
import os
import time


def read_framed_release(fd, attempt, max_len, deadline, selector):
    token = (attempt + '\n').encode()
    buf = bytearray()
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ValueError('release deadline')
        if not selector.select(remaining):
            raise ValueError('release deadline')
        chunk = os.read(fd, 64)
        if not chunk:
            raise ValueError('release partial' if buf else 'release EOF')
        buf.extend(chunk)
        if len(buf) > max_len:
            raise ValueError('release oversize')
        if b'\n' in buf:
            if bytes(buf) != token:
                raise ValueError('release token')
            return True
