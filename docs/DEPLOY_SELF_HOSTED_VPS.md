# Деплой на свой VPS (Nginx + PM2 + Let’s Encrypt)

Сценарий: отдельный поддомен **без** изменения чужих `sites-enabled`, общего `nginx.conf` и без массового `certbot --nginx`.

**Параметры из вашей задачи (замените при необходимости):**

| Что | Значение |
|-----|----------|
| Поддомен | `botme.siteaacess.store` |
| Сервер | `85.117.235.93` |
| Каталог приложения | `/var/www/botme.siteaacess.store` |
| Бэкенд приложения | `127.0.0.1:3000` (PM2) |
| Отдельный vhost | `/etc/nginx/sites-available/botme.siteaacess.store` |

Перед SSL: DNS **A**-запись для `botme.siteaacess.store` → `85.117.235.93`.

---

После SSL: в **HTTPS** `server { ... }` для `botme.siteaacess.store` в `location /` нужны увеличенные таймауты к upstream (`vite preview` на 3000), иначе длинный `serverRunPipeline` / Ollama получит **504 Gateway Timeout** (дефолт nginx ~60 с):

```nginx
proxy_connect_timeout 600s;
proxy_send_timeout 1800s;
proxy_read_timeout 1800s;
send_timeout 1800s;
```

См. эталон `nginx.botme.siteaacess.store.conf` в корне репозитория.

---

## 1. Подключение

```bash
ssh root@85.117.235.93
```

---

## 2. Каталог проекта (корень деплоя)

```bash
mkdir -p /var/www/botme.siteaacess.store
cd /var/www/botme.siteaacess.store
```

Дальше — либо `git clone <url> .`, либо загрузка архива.

---

## 3. Сборка и окружение

На сервере желательно **Node.js ≥ 22.12** (предупреждение `npm`); на v20 сборка обычно проходит.

```bash
cd /var/www/botme.siteaacess.store
npm ci
# Скопируйте секреты (вручную или через CI):
# cp /path/to/.env .env
npm run build
```

После `vite build` npm автоматически запускает **`postbuild`**: `node scripts/postbuild-dist-server-link.mjs` — создаётся `dist/server/server.js` → `index.js` (требование превью-сервера).

Одна команда обновления на сервере:

```bash
chmod +x /var/www/botme.siteaacess.store/deploy.sh
/var/www/botme.siteaacess.store/deploy.sh
```

(`deploy.sh`: при отсутствии `.git` пропускает `git pull`, затем `npm ci`, `npm run build`, `pm2 restart botme-app`.)

Переменные из `.env` (пример): `OLLAMA_API_TOKEN`, `OLLAMA_CHAT_URL` (или база `…/v1`), `TAVILY_API_KEY`, `CONTEXT7_*`, `VERCEL_TOKEN` для `/api/deploy`. Для Ollama на проде используйте именно **`OLLAMA_*`**, не только `VITE_*`: иначе после `vite build` токен в бандле может быть пустым, а PM2 подмешивает `.env` только в **runtime**. Сборка кладёт секреты в `dist/server/.dev.vars`; в рантайме Cloudflare/Miniflare передаёт их во второй аргумент `fetch` (`env`), поэтому в проекте есть обёртка `src/cloudflare-worker-entry.ts`, которая копирует `env` в `globalThis.process.env` перед TanStack Start — без этого LLM не видит токен.

---

## 4. PM2

```bash
npm install -g pm2
cd /var/www/botme.siteaacess.store
pm2 start npm --name botme-app -- start
pm2 save
pm2 startup   # один раз, выполнить указанную команду
```

Скрипт **`npm run start`** в этом репозитории поднимает прод‑просмотр после `vite build` на **`127.0.0.1:3000`**, чтобы Nginx проксировал туда же, что и в вашем шаблоне.

**Переменные окружения в PM2:** используйте **`ecosystem.config.cjs`** в корне проекта — он подмешивает все ключи из **`.env`** (в т.ч. `VERCEL_TOKEN` для `POST /api/deploy`). Секреты не вносите в `ecosystem.config.cjs`, только в `.env` на сервере.

```bash
cd /var/www/botme.siteaacess.store
# после правок .env:
pm2 reload ecosystem.config.cjs --update-env
pm2 save
```

Опционально ротация логов:

```bash
pm2 install pm2-logrotate
```

Полезно:

```bash
pm2 list
pm2 logs botme-app
```

---

## 5. Nginx — отдельный vhost (только этот домен)

Создать файл (не трогая другие сайты):

```bash
nano /etc/nginx/sites-available/botme.siteaacess.store
```

Минимальный прокси на PM2 (HTTP до certbot):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name botme.siteaacess.store;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Обязательно для serverRunPipeline + Ollama (иначе 504 через ~60 с)
        proxy_connect_timeout 600s;
        proxy_send_timeout 1800s;
        proxy_read_timeout 1800s;
        send_timeout 1800s;
    }
}
```

После настройки HTTPS тот же блок `location /` с таймаутами должен быть и в **443** `server` (см. начало файла и `nginx.botme.siteaacess.store.conf`). На уже работающем сервере: `bash scripts/nginx-patch-long-proxy-timeouts.sh` (из корня клона на VPS) или вручную вставить четыре `proxy_*` / `send_timeout`.

Активация:

```bash
ln -s /etc/nginx/sites-available/botme.siteaacess.store /etc/nginx/sites-enabled/botme.siteaacess.store
nginx -t && systemctl reload nginx
```

**Не удалять и не править** симлинки/файлы других проектов.

---

## 6. SSL — только этот хост

```bash
apt update
apt install -y certbot python3-certbot-nginx
```

Выпуск сертификата **только** для поддомена (Certbot добавит `listen 443 ssl` в этот `server` или создаст отдельный блок — зависимость от версии; другие vhost не трогаем, если не указаны явно):

```bash
certbot --nginx -d botme.siteaacess.store
```

**Не запускать** голый `certbot --nginx` без `-d` на проде с множеством сайтов.

После:

```bash
nginx -t && systemctl reload nginx
```

---

## 7. Проверка

```bash
curl -I https://botme.siteaacess.store
```

В браузере: открыть сайт, проверить генерацию и при необходимости `POST /api/deploy` (нужен `VERCEL_TOKEN` на сервере).

---

## 8. Где что лежит (шпаргалка)

| Назначение | Путь |
|------------|------|
| Код и `dist` | `/var/www/botme.siteaacess.store` |
| Конфиг Nginx | `/etc/nginx/sites-available/botme.siteaacess.store` → `sites-enabled` |
| Сертификат | `/etc/letsencrypt/live/botme.siteaacess.store/` |
| Процесс | `pm2`, имя `botme-app` |

## 9. Заглушка `/api/chat/stream` (204 на проде)

У приложения нет SSE-чата. Чтобы мониторинг не видел **404**, в **vhost только `botme.siteaacess.store`** добавлено:

```nginx
location = /api/chat/stream {
    return 204;
}
```

(в HTTPS-блоке, перед `location /`.) Локально без Nginx путь может отдаваться иначе — это ожидаемо.

---

### Чат Builder и LLM (только сервер)

Чат вызывает пайплайн через **`serverRunPipeline`** (`src/lib/pipeline-server-fn.ts`, `createServerFn`), а не прямой `runPipeline` из клиентского маршрута. Иначе оркестратор и Ollama попадают в браузерный бандл, **`getOllamaToken()` падает до любого HTTP-запроса** — в Network не видно `/_serverFn/…`, только локальная ошибка.

## 10. Риски (как вы их обходите)

1. **Certbot без `-d`** — может затронуть лишние server_name; всегда указывайте домен.
2. **Правки `nginx.conf`** — не нужны для одного нового сайта.
3. **Удаление чужих файлов в `sites-enabled`** — не делать; добавляется только один симлинк.

**Дополнительно:** в `vite.config.ts` задан `preview.allowedHosts` с `botme.siteaacess.store`, иначе Vite отвечает 403 по заголовку `Host`. Деплой в Vercel из API выполняется через **`npx vercel deploy`** (пакет `@vercel/client` в проекте не используется — он ломал SSR в Node).

---

## Примечание про стек сборки

Проект собран с ориентацией на Cloudflare/Vite (как в шаблоне Lovable). Для VPS после `npm run build` используется **`vite preview`** как `npm start` (см. `package.json`). Если позже понадобится классический Node‑сервер из `.output` (Nitro), см. [TanStack Start — Node.js / Docker](https://tanstack.com/start/latest/docs/framework/react/guide/hosting).
