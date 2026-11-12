"""Download com verificação de certificado para sites que não enviam a cadeia completa.

Os servidores da Marinha mandam só o certificado final, sem o intermediário. Em vez de
desligar a verificação, buscamos o intermediário no endereço que o próprio certificado
indica (AIA) e validamos normalmente contra as autoridades raiz do sistema.
"""
import ssl, urllib.request, urllib.parse
from cryptography import x509
from cryptography.x509.oid import AuthorityInformationAccessOID
from cryptography.hazmat.primitives.serialization import Encoding

UA = {"User-Agent": "Mozilla/5.0 (compatible; rumo-mares; +https://ednesic.github.io/rumo/)"}
_ctx = {}

def _context(host):
    if host in _ctx:
        return _ctx[host]
    ctx = ssl.create_default_context()
    try:
        cert = x509.load_pem_x509_certificate(ssl.get_server_certificate((host, 443), timeout=30).encode())
        for _ in range(4):
            if cert.issuer == cert.subject:
                break
            try:
                aia = cert.extensions.get_extension_for_class(x509.AuthorityInformationAccess).value
            except x509.ExtensionNotFound:
                break
            urls = [d.access_location.value for d in aia if d.access_method == AuthorityInformationAccessOID.CA_ISSUERS]
            if not urls:
                break
            raw = urllib.request.urlopen(urllib.request.Request(urls[0], headers=UA), timeout=30).read()
            try:
                cert = x509.load_der_x509_certificate(raw)
            except ValueError:
                cert = x509.load_pem_x509_certificate(raw)
            if cert.issuer != cert.subject:  # só intermediários; a raiz tem de estar no sistema
                ctx.load_verify_locations(cadata=cert.public_bytes(Encoding.PEM).decode())
    except Exception as e:  # sem AIA: segue com o contexto padrão e deixa a verificação falhar
        print("aviso: não consegui completar a cadeia de", host, "-", e)
    _ctx[host] = ctx
    return ctx

def fetch(url, timeout=90):
    host = urllib.parse.urlsplit(url).hostname
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=_context(host)) as r:
        return r.read()
