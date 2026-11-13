#!/usr/bin/env python3
# license_check.py: recovered from ~/.local/bin on the seized laptop.
# suspect_47 called this "uncrackable". it guards their exfil tool.
import base64

KEY = len("suspect_47") * 4 + 2
SECRET = "V08YThxMGB8TE091QUkZQkl1GUJedU4ZWVgZXBlYUVJfRERTRg=="


def mangle(key: str) -> str:
    b = key.encode()
    b = bytes(c ^ KEY for c in b)        # 1. xor every byte
    b = b[::-1]                          # 2. reverse
    return base64.b64encode(b).decode()  # 3. base64


if __name__ == "__main__":
    key = input("license key: ").strip()
    print("valid. welcome back, 47." if mangle(key) == SECRET else "invalid license.")
