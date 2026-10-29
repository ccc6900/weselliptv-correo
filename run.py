import os
import re
import json
import time
import imaplib
import email
import html
from datetime import datetime, timezone
from urllib.parse import urlsplit, parse_qs
from email.header import decode_header
from email.utils import parsedate_to_datetime

IMAP_HOST = "imap.gmx.es"
IMAP_PORT = 993
OUTPUT_FILE = "result.json"
EMAILS_FILE = "emails.json"
USED_EMAIL_FILE = "used-email.txt"
MAX_MESSAGES = 100
WAIT_TIMEOUT = int(os.environ.get("WAIT_TIMEOUT", "300"))
WAIT_INTERVAL = int(os.environ.get("WAIT_INTERVAL", "20"))


def decode_mime(value):
    if not value:
        return ""
    parts = []
    for chunk, charset in decode_header(value):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(charset or "utf-8", errors="replace"))
        else:
            parts.append(chunk)
    return "".join(parts)


def normalize_url(value):
    if not value:
        return ""
    value = value.strip()
    value = re.sub(r"\s+", "", value)
    return value


def get_body(msg):
    plain_parts, html_parts = [], []
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_disposition() == "attachment":
                continue
            ctype = part.get_content_type()
            if ctype not in ("text/plain", "text/html"):
                continue
            raw = part.get_payload(decode=True)
            if raw is None:
                continue
            charset = part.get_content_charset() or "utf-8"
            text = raw.decode(charset, errors="replace")
            (plain_parts if ctype == "text/plain" else html_parts).append(text)
    else:
        raw = msg.get_payload(decode=True)
        if raw:
            charset = msg.get_content_charset() or "utf-8"
            text = raw.decode(charset, errors="replace")
            (plain_parts if msg.get_content_type() == "text/plain" else html_parts).append(text)

    if plain_parts:
        return "\n".join(plain_parts)
    if html_parts:
        text = "\n".join(html_parts)
        text = re.sub(r"(?i)<br\s*/?>", "\n", text)
        text = re.sub(r"(?i)</p\s*>", "\n", text)
        return html.unescape(re.sub(r"<[^>]+>", " ", text))
    return ""


def extract_value(body, labels):
    label_pattern = "|".join(re.escape(label) for label in labels)
    match = re.search(rf"(?im)^\s*(?:{label_pattern})\s*:\s*(.+?)\s*$", body)
    return match.group(1).strip().rstrip(".,") if match else ""


def extract_m3u(body):
    decoded = body.replace("&amp;", "&").replace("&#x3D;", "=")
    urls = re.findall(r"https?://[^\s<>\"']+", decoded, flags=re.I)
    for url in urls:
        url = url.rstrip(".,);]")
        lower_url = url.lower()
        if "m3u" in lower_url or "playlist" in lower_url or "get.php" in lower_url:
            return url
    return ""


def values_from_url(m3u_url):
    if not m3u_url:
        return {"username": "", "password": "", "host_url": ""}
    try:
        parsed = urlsplit(m3u_url)
        params = parse_qs(parsed.query, keep_blank_values=True)
        username = (params.get("username") or params.get("user") or [""])[0]
        password = (params.get("password") or params.get("pass") or [""])[0]
        host_url = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
        return {"username": username, "password": password, "host_url": host_url}
    except (ValueError, TypeError):
        return {"username": "", "password": "", "host_url": ""}


def load_emails():
    if not os.path.exists(EMAILS_FILE):
        return []
    with open(EMAILS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def save_emails(data):
    with open(EMAILS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def save_result(data):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def read_used_email():
    if not os.path.exists(USED_EMAIL_FILE):
        return ""
    with open(USED_EMAIL_FILE, "r", encoding="utf-8") as f:
        return f.read().strip()


def mark_used_email(email_address, result):
    if not email_address:
        return
    emails = load_emails()
    now = datetime.now(timezone.utc).isoformat()
    found = False
    for item in emails:
        if item.get("email", "").strip().lower() == email_address.lower():
            item["status"] = "usado"
            item["used_at"] = now
            item["result"] = result
            found = True
            break
    if not found:
        emails.append({
            "email": email_address,
            "status": "usado",
            "used_at": now,
            "result": result
        })
    save_emails(emails)


def fetch_message(mail, msg_id):
    status, msg_data = mail.fetch(msg_id, "(RFC822)")
    if status != "OK":
        return None
    raw_message = next((item[1] for item in msg_data if isinstance(item, tuple)), None)
    if not raw_message:
        return None
    return email.message_from_bytes(raw_message)


def message_is_activation(msg):
    subject = decode_mime(msg.get("Subject", "")).lower()
    sender = decode_mime(msg.get("From", "")).lower()
    keywords = ("iptv", "trial line", "trial", "free trial", "activated",
                "activation", "subscription", "your line")
    return any(word in subject for word in keywords) or ("iptv" in sender) or ("123iptv" in sender)


def parse_candidate(msg):
    subject = decode_mime(msg.get("Subject", ""))
    sender = decode_mime(msg.get("From", ""))
    body = get_body(msg)
    m3u = extract_m3u(body)
    username = extract_value(body, ["Username", "User name", "Usuario"])
    stream_password = extract_value(body, ["Password", "Pass", "Contraseña"])
    host = extract_value(body, ["Host URL", "Host Url", "Server URL", "Servidor"])
    backup = extract_value(body, ["Backup Host Url", "Backup Host URL", "Backup URL"])

    url_values = values_from_url(m3u)
    username = username or url_values["username"]
    stream_password = stream_password or url_values["password"]
    host = host or url_values["host_url"]

    host = normalize_url(host)
    backup = normalize_url(backup)
    m3u = normalize_url(m3u)

    if not m3u and not (username or host):
        return None

    return {
        "estado": "OK",
        "asunto": subject,
        "remitente": sender,
        "fecha_correo": msg.get("Date", ""),
        "username": username,
        "password": stream_password,
        "host_url": host,
        "backup_host_url": backup,
        "m3u_url": m3u,
        "mensaje": "Datos extraídos del correo de activación más reciente."
    }


def internal_date(mail, msg_id):
    status, data = mail.fetch(msg_id, "(INTERNALDATE)")
    if status != "OK":
        return datetime.min.replace(tzinfo=timezone.utc)
    raw = b" ".join(item if isinstance(item, bytes) else b"" for item in data)
    match = re.search(rb'INTERNALDATE "([^"]+)"', raw)
    if not match:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return parsedate_to_datetime(match.group(1).decode("ascii"))
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def find_latest_activation(mail):
    status, data = mail.search(None, "ALL")
    ids = data[0].split() if status == "OK" and data and data[0] else []
    ids = ids[-MAX_MESSAGES:]
    if not ids:
        return None, None

    dated_ids = sorted(ids, key=lambda item: internal_date(mail, item), reverse=True)
    print(f"Mensajes revisados en INBOX: {len(dated_ids)}")

    for msg_id in dated_ids:
        msg = fetch_message(mail, msg_id)
        if msg is None or not message_is_activation(msg):
            continue
        candidate = parse_candidate(msg)
        if candidate:
            return msg, candidate
    return None, None


def wait_for_activation(mail):
    start = time.time()
    attempt = 0
    while True:
        attempt += 1
        print(f"Intento {attempt}: buscando correo de activación...")
        msg, candidate = find_latest_activation(mail)
        if candidate:
            print("Correo de activación encontrado.")
            return msg, candidate
        if time.time() - start >= WAIT_TIMEOUT:
            return None, None
        remaining = WAIT_TIMEOUT - (time.time() - start)
        wait = min(WAIT_INTERVAL, max(1, int(remaining)))
        print(f"No encontrado. Esperando {wait}s (quedan {int(remaining)}s)...")
        time.sleep(wait)
        try:
            mail.select("INBOX", readonly=True)
        except Exception:
            pass


def main():
    user = os.environ.get("GMX_USER", "").strip()
    password = os.environ.get("GMX_PASS", "")

    if not user or not password:
        raise RuntimeError("Faltan los secretos GMX_USER o GMX_PASS en GitHub Actions.")

    used_email = read_used_email()
    if not used_email:
        raise RuntimeError("No se encontró used-email.txt. ¿Se ejecutó send-email.js correctamente?")

    print(f"Correo usado (desde used-email.txt): {used_email}")

    result = {
        "estado": "SIN_RESULTADO", "asunto": "", "fecha_correo": "", "remitente": "",
        "username": "", "password": "", "host_url": "", "backup_host_url": "", "m3u_url": "",
        "correo_usado": used_email,
        "fecha_procesado": datetime.now(timezone.utc).isoformat(),
        "mensaje": "No se ha encontrado un correo de activación."
    }

    mail = None
    try:
        mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
        mail.login(user, password)
        status, _ = mail.select("INBOX", readonly=True)
        if status != "OK":
            raise RuntimeError("No se ha podido abrir la bandeja de entrada de GMX.")

        msg, candidate = wait_for_activation(mail)
        if candidate:
            result.update(candidate)
            result["correo_usado"] = used_email
            print("Correo de activación procesado correctamente.")
        else:
            result["mensaje"] = (
                f"No se ha encontrado un correo de activación en {WAIT_TIMEOUT}s "
                f"para {used_email}."
            )
            print(result["mensaje"])

        save_result(result)
        mark_used_email(used_email, result)
        print(f"Estado: {result['estado']}")
        print("Se han guardado result.json y emails.json.")
    finally:
        if mail is not None:
            try:
                mail.logout()
            except Exception:
                pass


if __name__ == "__main__":
    main()
