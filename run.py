import os, re, json
from datetime import datetime, timezone
from urllib.parse import urlencode

def normalize_url(v): return re.sub(r"\s+", "", v.strip()) if v else ""
def extract_value(body, labels):
    pattern = "|".join(re.escape(l) for l in labels)
    match = re.search(rf"(?im)^\s*(?:{pattern})\s*:\s*(.+?)\s*$", body)
    return match.group(1).strip().rstrip(".,") if match else ""

def main():
    used_email = open('used-email.txt').read().strip() if os.path.exists('used-email.txt') else ""
    result = {"estado": "SIN_RESULTADO", "correo_usado": used_email, "fecha": datetime.now(timezone.utc).isoformat()}
    
    if os.path.exists('email-body.txt'):
        body = open('email-body.txt', encoding='utf-8').read()
        username = extract_value(body, ["Username", "User", "Usuario"])
        password = extract_value(body, ["Password", "Pass", "Contraseña"])
        host = normalize_url(extract_value(body, ["Host URL", "Host", "Server", "Domain"]))
        
        m3u = ""
        if username and password and host:
            if not host.startswith("http"): host = "http://" + host
            m3u = f"{host.rstrip('/')}/get.php?{urlencode({'username': username, 'password': password, 'type': 'm3u_plus'})}"
        
        result.update({"estado": "OK", "username": username, "password": password, "host_url": host, "m3u_url": m3u})

    with open('result.json', 'w', encoding='utf-8') as f: json.dump(result, f, indent=2, ensure_ascii=False)
    
    # Marcar como usado
    if used_email and os.path.exists('emails.json'):
        emails = json.load(open('emails.json', encoding='utf-8'))
        for e in emails:
            if e['email'].lower() == used_email.lower():
                e['status'] = 'usado'
                e['used_at'] = result['fecha']
                e['result'] = result
        json.dump(emails, open('emails.json', 'w', encoding='utf-8'), indent=2, ensure_ascii=False)
    
    print("Proceso terminado.")

if __name__ == "__main__": main()
