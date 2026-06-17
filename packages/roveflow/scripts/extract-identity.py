#!/usr/bin/env python3
"""Extract ONE code-signing identity from a multi-identity .p12 and repackage it
in the legacy (3DES/SHA1) format go-ios accepts. You run this — it touches your
private key, so Roveflow itself never does.

Usage:
  extract-identity.py <src.p12> <password> <cert-id-substring> <out.p12>

<cert-id-substring> is the bit in parens of the cert name, e.g. 66NN76CBQ2.
"""
import subprocess, sys, re, os, tempfile

if len(sys.argv) < 5:
    sys.exit(__doc__)
SRC, PASS, WANT, OUT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]


def dump():
    for extra in (["-legacy"], []):
        p = subprocess.run(["openssl", "pkcs12", "-in", SRC, "-passin", f"pass:{PASS}", "-nodes"] + extra,
                           capture_output=True, text=True)
        if p.returncode == 0 and "PRIVATE KEY" in p.stdout:
            return p.stdout
    sys.exit("openssl could not read the p12 (wrong password?).")


pem = dump()
bags = re.split(r"(?=Bag Attributes)", pem)
cert_pem = key_id = None
keys = {}
for b in bags:
    m = re.search(r"localKeyID:\s*([0-9A-Fa-f ]+)", b)
    lk = m.group(1).strip() if m else None
    c = re.search(r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", b, re.S)
    if c and WANT in b:
        cert_pem, key_id = c.group(0), lk
    k = re.search(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", b, re.S)
    if k and lk:
        keys[lk] = k.group(0)

if not cert_pem or key_id not in keys:
    sys.exit(f"No cert+key pair matching '{WANT}' in {SRC}.")

with tempfile.TemporaryDirectory() as td:
    cp, kp = os.path.join(td, "c.pem"), os.path.join(td, "k.pem")
    open(cp, "w").write(cert_pem + "\n")
    open(kp, "w").write(keys[key_id] + "\n")
    r = subprocess.run(["openssl", "pkcs12", "-export", "-in", cp, "-inkey", kp, "-out", OUT,
                        "-passout", f"pass:{PASS}", "-legacy",
                        "-keypbe", "PBE-SHA1-3DES", "-certpbe", "PBE-SHA1-3DES", "-macalg", "sha1"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("repack failed:\n" + r.stderr)
print(f"OK -> {OUT}  (single identity: {WANT}, legacy 3DES/SHA1)")
