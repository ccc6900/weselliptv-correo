import os
import re
import json
import imaplib
import email
import html
from urllib.parse import urlsplit, parse_qs
from email.header import decode_header

IMAP_HOST = "imap.gmx.es"
IMAP_PORT = 993
OUTPUT_FILE = "result.json"
MAX_MESSAGES = 100


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


def get_body(msg):
    plain_parts = []
    html_parts = []

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
    match = re.search(
        rf"(?im)^\s*(?:{label_pattern})\s*:\s*(.+?)\s*$",
        body
    )
    return match.group(1).strip().rstrip(".,") if match else ""


def extract_m3u(body):
    decoded = body.replace("&amp;", "&").replace("&#x3D;", "=")
    urls = re.findall(r"https?://[^\s<>\\"']+", decoded, flags=re.I)

    for url in urls:
        url = url.rstrip(".,);]")
        lower_url = url.lower()
        if "m3u" in lower_url or "playlist" in lower_url or "get.php" in lower_url:
            return url

    return ""


def values_from_url(m3u_url):
    """Extrae los campos habituales de una URL M3U, si están presentes."""
    if not m3u_url:
        return {"username": "", "password": "", "host_url": ""}

    try:
        parsed = urlsplit(m3u_url)
        params = parse_qs(parsed.query, keep_blank_values=True)
        username = (params.get("username") or params.get("user") or [""])[0]
        password = (params.get("password") or params.get("pass") or [""])[0]
        host_url = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
        return {
            "username": username,
            "password": password,
            "host_url": host_url
        }
    except (ValueError, TypeError):
        return {"username": "", "password": "", "host_url": ""}


def save_result(data):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def parse_candidate(mail, msg_id):
    """Devuelve los datos extraídos si el mensaje contiene una respuesta M3U reconocible."""
    status, msg_data = mail.fetch(msg_id, "(RFC822)")
    if status != "OK":
        return None

    raw_message = next(
        (item[1] for item in msg_data if isinstance(item, tuple)),
        None
    )
    if not raw_message:
        return None

    msg = email.message_from_bytes(raw_message)
    subject = decode_mime(msg.get("Subject", ""))
    sender = decode_mime(msg.get("From", ""))
    body = get_body(msg)

    m3u = extract_m3u(body)
    username = extract_value(body, ["Username", "User name", "Usuario"])
    stream_password = extract_value(body, ["Password", "Pass", "Contraseña"])
    host = extract_value(body, ["Host URL", "Host Url", "Server URL", "Servidor"])
    backup = extract_value(body, ["Backup Host Url", "Backup Host URL", "Backup URL"])

    # Si el correo no presenta los campos por separado, extraerlos de la URL M3U.
    url_values = values_from_url(m3u)
    username = username or url_values["username"]
    stream_password = stream_password or url_values["password"]
    host = host or url_values["host_url"]

    body_lower = body.lower()
    subject_lower = subject.lower()
    looks_relevant = bool(
        m3u and (
            username
            or host
            or "xtream" in body_lower
            or "iptv" in subject_lower
            or "trial line" in subject_lower
        )
    )
    if not looks_relevant:
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
        "mensaje": "Se ha extraído el enlace M3U y se han completado los campos disponibles desde el correo y su URL."
    }


def main():
    user = os.environ.get("GMX_USER", "").strip()
    password = os.environ.get("GMX_PASS", "")
    if not user or not password:
        raise RuntimeError("Faltan los secretos GMX_USER o GMX_PASS en GitHub Actions.")

    result = {
        "estado": "SIN_RESULTADO",
        "asunto": "",
        "fecha_correo": "",
        "remitente": "",
        "username": "",
        "password": "",
        "host_url": "",
        "backup_host_url": "",
        "m3u_url": "",
        "mensaje": "No se ha encontrado todavía un correo con datos M3U."
    }

    mail = None
    try:
        mail = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
        mail.login(user, password)
        status, _ = mail.select("INBOX", readonly=True)
        if status != "OK":
            raise RuntimeError("No se ha podido abrir la bandeja de entrada de GMX.")

        # Primero buscar correos NO LEÍDOS; si no hay uno reconocible,
        # se revisan después los mensajes recientes de toda la bandeja.
        status_unseen, unseen_data = mail.search(None, "UNSEEN")
        unseen_ids = unseen_data[0].split() if status_unseen == "OK" and unseen_data and unseen_data[0] else []
        unseen_ids = unseen_ids[-MAX_MESSAGES:]

        status_all, all_data = mail.search(None, "ALL")
        all_ids = all_data[0].split() if status_all == "OK" and all_data and all_data[0] else []
        all_ids = all_ids[-MAX_MESSAGES:]

        if not all_ids:
            result["mensaje"] = "La bandeja de entrada está vacía."
            save_result(result)
            print(result["mensaje"])
            return

        # Los no leídos tienen prioridad absoluta. Después se comprueban
        # los demás mensajes recientes, sin repetir los identificadores.
        unseen_set = set(unseen_ids)
        ordered_ids = list(reversed(unseen_ids))
        ordered_ids.extend(msg_id for msg_id in reversed(all_ids) if msg_id not in unseen_set)

        for msg_id in ordered_ids:
            candidate = parse_candidate(mail, msg_id)
            if candidate:
                result.update(candidate)
                if msg_id in unseen_set:
                    result["mensaje"] += " Se ha priorizado un correo no leído."
                break

        if result["estado"] != "OK":
            result["mensaje"] = (
                f"No se ha encontrado una respuesta M3U reconocible "
                f"en los últimos {len(all_ids)} mensajes revisados."
            )

        save_result(result)
        print(result["mensaje"])
        print(f"Estado: {result['estado']}")
        print("Se ha guardado result.json.")

    finally:
        if mail is not None:
            try:
                mail.logout()
            except Exception:
                pass


if __name__ == "__main__":
    main()
