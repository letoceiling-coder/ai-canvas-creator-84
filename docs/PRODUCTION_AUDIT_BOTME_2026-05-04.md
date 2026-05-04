# Production audit: botme.siteaacess.store

**Дата:** 2026-05-04 (UTC)  
**Сервер:** 85.117.235.93  
**Каталог:** `/var/www/botme.siteaacess.store`  
**Метод:** команды выполнены по SSH; nginx/SSL других проектов не изменялись.

---

## SERVER STATUS

### pm2 list

```
┌────┬──────────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┬──────────┬──────────┬──────────┬──────────┐
│ id │ name         │ namespace   │ version │ mode    │ pid      │ uptime │ ↺    │ status    │ cpu      │ mem      │ user     │ watching │
├────┼──────────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 5  │ agent-api    │ default     │ 2.0.0   │ fork    │ 216954   │ 6D     │ 0    │ online    │ 0%       │ 68.3mb   │ root     │ disabled │
│ 6  │ botme-app    │ default     │ N/A     │ fork    │ 529391   │ …      │ 5    │ online    │ 0%       │ …        │ root     │ disabled │
└────┴──────────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┴──────────┴──────────┴──────────┴──────────┘
```

**Проверка:** `botme-app` в статусе **online**. Поле `↺` показывает накопленное число перезапусков за жизнь процесса в PM2 (в т.ч. после ручных `restart`/`deploy`, не только crash-loop). После `pm2 flush` и контрольного запроса **новых** строк в `botme-app-error.log` не появилось.

### pm2 logs botme-app (до flush)

В логе **ошибок** сохранялись **исторические** stack trace со старым бандлом `router-D2T8iI7m.js` (@vercel/client / `__filename`) — **24 вхождения**, актуальный бандл на диске: `router-5k6pGrpb.js` (~116 KiB). Это подтверждает, что сообщения относились к **прошлой** сборке, а не к текущей.

### Порт 3000

```
tcp   LISTEN 0      511        127.0.0.1:3000       0.0.0.0:*    users:(("node",pid=…,fd=24))
```

### nginx

`nginx -t`:

```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

`systemctl status nginx`: **active (running)**.

### SSL (certbot certificates)

Для **botme.siteaacess.store**:

- **Expiry Date:** 2026-08-02 17:08:23+00:00 (VALID: 89 days на момент проверки)
- **Path:** `/etc/letsencrypt/live/botme.siteaacess.store/`

### HTTP(S)

`curl -sI https://botme.siteaacess.store/`:

```
HTTP/1.1 200 
Server: nginx/1.24.0 (Ubuntu)
Content-Type: text/html; charset=utf-8
...
```

---

## API STATUS

### POST /api/deploy (тело из задания)

Команда на сервере:

```bash
curl -sS -X POST https://botme.siteaacess.store/api/deploy \
  -H "Content-Type: application/json" \
  -d '{"files":{},"projectName":"test"}'
```

**Ответ (пример):**

```json
{"error":"Server misconfigured: VERCEL_TOKEN is not set"}
HTTP: 503
```

**Проверка:** это **не** HTTP 500; тело **JSON**. Причина 503 — отсутствует `VERCEL_TOKEN` в окружении процесса PM2 (ожидаемо, если `.env` не подключён к `pm2` / нет экспорта переменных). Для полного приёма деплоя нужно задать токен и перезапустить приложение (например `pm2 restart botme-app --update-env` после настройки env).

### Нагрузка (10 параллельных запросов)

```bash
seq 10 | xargs -P10 -I{} curl -sS -o /dev/null -w '%{http_code}\n' https://botme.siteaacess.store/
```

**Результат:** `10` строк со статусом **200**. После прогона `botme-app` оставался **online** (без нового restart loop в рамках теста).

### SSE /api/chat/stream

`curl -sSI https://botme.siteaacess.store/api/chat/stream`:

```
HTTP/1.1 404 
```

**Вывод:** отдельного маршрута **нет** (ожидаемо для текущего приложения).

---

## DEPLOY STATUS

| Элемент | Статус |
|--------|--------|
| `postbuild` → symlink `dist/server/server.js` | **Да**, на Linux: вывод `[postbuild] dist/server/server.js -> index.js`, `ls -la` показывает symlink |
| `./deploy.sh` | **Выполнен успешно** на сервере (вывод заканчивается `[deploy] ok`, `pm2 restart` выполнен) |

---

## ERRORS

1. **Исторические** ошибки в `botme-app-error.log` (старый бандл + @vercel/client) — **не относятся** к текущему `dist` (см. подсчёт `D2T8iI7m` vs текущий `router-5k6pGrpb.js`).
2. Локально на Windows symlink в `postbuild` может выдать `EPERM` без прав на symlink — на **production Linux** проблема не воспроизводится.
3. `/api/deploy` → **503** без `VERCEL_TOKEN` — конфигурация, не падение приложения.

---

## FIXES APPLIED

1. Добавлен **`scripts/postbuild-dist-server-link.mjs`** и хук **`postbuild`** в `package.json` для автоматического symlink после `npm run build`.
2. Добавлен **`deploy.sh`** в корень проекта (на сервере: `chmod +x`, проверен полный прогон).
3. Выполнен **`pm2 flush botme-app`** для отделения **текущих** логов от исторических ошибок (после контрольного запроса `error.log` пуст).

---

## MONITORING

- **`pm2 monit`:** интерактивная TUI — в данном аудите **не** запускалась (нет интерактивной сессии). Для снимка использованы `pm2 list` / `pm2 describe`.
- **`pm2 logs botme-app`:** после flush ошибок при простом GET не зафиксировано.

---

## SSL AUTO-RENEW

`systemctl status certbot.timer`:

```
● certbot.timer - Run certbot twice daily
     Loaded: … enabled
     Active: active (waiting) …
    Triggers: ● certbot.service
```

Дополнительно включать timer **не потребовалось** — уже **enabled** и **active (waiting)**.

---

## PRODUCT CHECKS (ручные)

Выполнить в браузере: https://botme.siteaacess.store  

Проверки из задания (генерация, preview, кнопка Deploy, отсутствие ошибок UI) **не выполнялись агентом** — нет доступа к интерактивному браузеру. Рекомендуется подтвердить вручную.

---

## FINAL VERDICT

- **Сервер стабильный** по результатам: nginx/SSL OK, PM2 online, главная отдаёт **200**, параллельные запросы **не роняют** процесс, после flush **нет новых** ошибок в логе при контрольном запросе.
- **Готов к продакшену:** **условно да** — для полноценного Deploy через API нужен **`VERCEL_TOKEN`** (и при необходимости остальной `.env`) в среде **PM2**; без этого `/api/deploy` остаётся **503** с понятным JSON.
- **Ограничение:** нода на сервере **v20.20.0** при peer **TanStack Start ≥ 22.12** — пока только предупреждения `EBADENGINE`, сборка проходит; для полного соответствия рекомендуется обновить Node.
