# Scheduler de CoCo en el VPS de Hostinger

Vercel Hobby solo permite un cron al día. La revisión diaria sigue en
`vercel.json` (`0 12 * * *`, 09:00 en Chile). Para que los recordatorios y las
propuestas proactivas se miren cada 15 minutos, el VPS llama al mismo endpoint.

## Secreto

El endpoint acepta `Authorization: Bearer`. Sirve `SCHEDULER_SECRET` o, si no
está, `CRON_SECRET` (el que ya usa Vercel). No hace falta un secreto nuevo.

En el VPS, un archivo que solo lee root:

```bash
sudo install -m 600 /dev/null /etc/convive/scheduler.env
sudoedit /etc/convive/scheduler.env
```

Contenido, sin commitearlo:

```bash
SCHEDULER_SECRET=el mismo valor que CRON_SECRET en Vercel
SITE_URL=https://conviveconnect.com
```

En Vercel, si quieres un secreto distinto para el VPS, define `SCHEDULER_SECRET`.
El cron de Vercel sigue enviando `CRON_SECRET` y también es válido.

## Script

Copia `docs/scripts/coco-scheduler.sh` a `/opt/convive/coco-scheduler.sh` y
dale permiso de ejecución (`chmod 755`). El script no imprime el secreto ni la
respuesta.

## Crontab

```cron
*/15 * * * * /opt/convive/coco-scheduler.sh
```

`mode=all` evalúa las reglas ya vencidas (recordatorios incluidos) y, además,
deja propuestas al administrador: gastos vencidos y reservas pendientes. No
avisa a residentes ni aprueba reservas. Si el curl se repite dentro de los
mismos 15 minutos, la segunda llamada responde sin volver a trabajar.

Las propuestas se confirman o se descartan en `/admin/coco-actividad`.
