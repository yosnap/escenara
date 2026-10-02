"""Recorrido reproducible contra admin-qa-local.ts; Chrome temporal, datos sintéticos."""
import json
import importlib.util
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('admin_qa_ampliacion', Path(__file__).with_name('admin-qa-ampliacion.py'))
ampliacion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ampliacion)

qa = json.loads(Path('/tmp/escenara-admin-qa.json').read_text())
base = qa['url']
capturas = Path(__file__).resolve().parents[3] / 'docs/assets/capturas'
errores = []
solicitudes = []

def cookies(cuenta):
    return [{'name': x.split('=', 1)[0].strip(), 'value': x.split('=', 1)[1], 'url': base}
            for x in qa['cuentas'][cuenta]['cookie'].split('; ') if '=' in x]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome')
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000})
    ctx.add_cookies(cookies('admin'))
    page = ctx.new_page()
    page.set_default_timeout(60000)
    page.on('pageerror', lambda e: errores.append(str(e)))
    page.on('request', lambda r: solicitudes.append(r.url))
    page.goto(base + '/admin', wait_until='networkidle')
    page.get_by_role('heading', name='Resumen operativo').wait_for()
    # El aviso técnico no autoriza recursos opcionales.
    if page.get_by_role('button', name='Entendido', exact=True).count():
        page.get_by_role('button', name='Entendido', exact=True).click()
    assert page.get_by_role('navigation', name='Aplicación', exact=True).count() == 0
    assert page.get_by_role('link', name='Crear', exact=True).count() == 0
    for ancho in [360, 768, 1440]:
        page.set_viewport_size({'width': ancho, 'height': 1000})
        for tema in ['light', 'dark']:
            page.evaluate('(tema) => document.documentElement.dataset.theme = tema', tema)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            page.screenshot(path=str(capturas / f'0.50.0-admin-resumen-{ancho}-{tema}.png'), full_page=True, animations='disabled')
        if ancho < 1024:
            menu = page.get_by_role('button', name='Menú de administración', exact=True)
            menu.click()
            dialogo = page.get_by_role('dialog', name='Menú de administración')
            assert dialogo.is_visible()
            assert page.evaluate('document.activeElement.closest("dialog") !== null')
            page.keyboard.press('Escape')
            assert not dialogo.is_visible()
            assert menu.evaluate('(n) => n === document.activeElement')
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.evaluate('document.documentElement.dataset.theme = "light"')
    assert page.get_by_role('link', name='Resumen', exact=True).get_attribute('aria-current') == 'page'
    page.get_by_label('Desde (UTC)').fill('2026-09-10')
    with page.expect_popup() as popup:
        page.get_by_role('link', name='Abrir aplicación ↗').click()
    popup.value.wait_for_load_state()
    assert page.url == base + '/admin'
    popup.value.close()
    assert page.get_by_label('Desde (UTC)').input_value() == '2026-09-10'
    print('Marco, tamaños, temas, foco, Escape y nueva pestaña: OK', flush=True)

    # Recorrido de todas las herramientas conservadas.
    rutas = ['/admin/usuarios', '/admin/consumo', '/admin/comunidad', '/admin/moderacion',
             '/admin/medios', '/admin/personajes', '/admin/modelos', '/admin/presets',
             '/admin/plantillas', '/admin/coherencia', '/admin/decisiones', '/admin/calibracion',
             '/admin/ajustes', '/admin/marca', '/admin/privacidad', '/admin/componentes', '/admin/versiones']
    for ruta in rutas:
        response = page.goto(base + ruta, wait_until='networkidle')
        assert response.status < 400, (ruta, response.status)
        assert page.get_by_role('navigation', name='Aplicación', exact=True).count() == 0
        assert page.locator('#contenido').count() == 1, ruta
        assert page.get_by_role('link', name='Abrir aplicación ↗').count() == 1
        if ruta in ['/admin/usuarios', '/admin/consumo', '/admin/comunidad', '/admin/privacidad', '/admin/ajustes']:
            for ancho in [360, 768, 1440]:
                page.set_viewport_size({'width': ancho, 'height': 1000})
                for tema in ['light', 'dark']:
                    page.evaluate('(tema) => document.documentElement.dataset.theme = tema', tema)
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (ruta, ancho, tema)
            page.evaluate('document.documentElement.dataset.theme = "light"')
    print('17 rutas administrativas conservadas: OK', flush=True)

    for rol in ['usuario', 'pendiente', 'bloqueado', 'borrado', None]:
        c = browser.new_context()
        if rol:
            c.add_cookies(cookies(rol))
        pg = c.new_page()
        pg.set_default_timeout(60000)
        for ruta in ['/admin', '/admin/usuarios', '/admin/consumo', '/admin/privacidad']:
            respuesta = pg.goto(base + ruta, wait_until='load')
            assert respuesta.status < 500
            assert pg.get_by_role('heading', name='Resumen operativo').count() == 0
            assert pg.get_by_role('navigation', name='Secciones de administración').count() == 0
        c.close()
    print('Visitante y cuatro estados de usuario sin acceso al admin: OK', flush=True)
    segundo = browser.new_context()
    segundo.add_cookies(cookies('admin2'))
    pg = segundo.new_page()
    respuesta = pg.goto(base + '/admin/usuarios', wait_until='networkidle')
    assert respuesta.status == 200
    assert pg.get_by_role('heading', name='Usuarios', exact=True).is_visible()
    segundo.close()

    # Buscar y conservar filtros al regresar de la ficha.
    cuenta = qa['cuentas']['pendiente']
    page.goto(base + '/admin/usuarios', wait_until='networkidle')
    page.get_by_label('Nombre o correo').fill(cuenta['email'])
    page.get_by_role('button', name='Filtrar', exact=True).click()
    page.wait_for_url(re.compile(r'.*q=.*'))
    page.locator(f'a[href^="/admin/usuarios/{cuenta["id"]}"]').click()
    page.wait_for_url(re.compile(r'.*/admin/usuarios/[^?]+.*'))
    page.get_by_label(re.compile('Motivo')).fill('Reenvío sintético de QA local')
    page.get_by_label('Confirmo la cuenta destinataria y esta acción.').check()
    posts = []
    page.on('request', lambda r: posts.append(r) if r.method == 'POST' else None)
    page.get_by_role('button', name='Reenviar activación', exact=True).click()
    page.get_by_text('SMTP ha aceptado el correo. No hay confirmación de entrega.', exact=True).wait_for()
    # Repetir la petición HTTP directamente con cookies de un usuario común.
    assert posts
    req = posts[-1]
    headers = {k: v for k, v in req.headers.items() if k.lower() not in ['cookie', 'content-length', 'host']}
    headers['Cookie'] = qa['cuentas']['usuario']['cookie']
    headers['Origin'] = base
    replay = ctx.request.post(req.url, headers=headers, data=req.post_data_buffer)
    texto = replay.text()
    assert 'SMTP ha aceptado' not in texto
    assert 'NEXT_NOT_FOUND' in texto or 'NEXT_HTTP_ERROR_FALLBACK;404' in texto or replay.status >= 400
    page.get_by_role('link', name='← Volver a usuarios').click()
    page.wait_for_url(re.compile(r'.*/admin/usuarios\?.*'))
    assert parse_qs(urlparse(page.url).query)['q'] == [cuenta['email']]
    print('Búsqueda, ficha, Mailpit y acción HTTP ajena rechazada: OK', flush=True)

    destino = qa['cuentas']['usuario']
    page.goto(base + '/admin/usuarios/' + destino['id'], wait_until='networkidle')
    page.get_by_label(re.compile('Motivo')).fill('Bloqueo sintético de QA local')
    page.get_by_label('Confirmo la cuenta destinataria y esta acción.').check()
    page.get_by_role('button', name='Bloquear', exact=True).click()
    page.get_by_role('button', name='Desbloquear', exact=True).wait_for()
    uctx = browser.new_context()
    uctx.add_cookies(cookies('usuario'))
    upage = uctx.new_page()
    upage.goto(base + '/proyectos', wait_until='networkidle')
    assert '/entrar' in upage.url
    uctx.close()
    page.get_by_label(re.compile('Motivo')).fill('Desbloqueo sintético de QA local')
    page.get_by_label('Confirmo la cuenta destinataria y esta acción.').check()
    page.get_by_role('button', name='Desbloquear', exact=True).click()
    page.get_by_role('button', name='Bloquear', exact=True).wait_for()
    print('Bloqueo visible, sesión revocada y desbloqueo: OK', flush=True)

    # Guardar configuración de un grupo y comprobar el inventario de privacidad.
    page.goto(base + '/admin/ajustes', wait_until='networkidle')
    page.get_by_role('combobox', name='Grupo de configuración').click()
    page.get_by_role('option', name='Privacidad y legal', exact=True).click()
    campo = page.get_by_label('Eventos de correo (días)', exact=True)
    campo.fill('30')
    page.get_by_role('button', name='Guardar cambios', exact=True).click()
    page.get_by_text('Cambios del grupo guardados.', exact=False).wait_for()
    page.goto(base + '/admin/privacidad', wait_until='networkidle')
    assert 'No configurada' in page.locator('body').inner_text()
    assert not any(re.search(r'google-analytics|googletagmanager|plausible|matomo|umami', u) for u in solicitudes)
    assert not errores, errores
    print('Configuración, privacidad, red sin analítica y errores de navegador: OK', flush=True)

    # Selector diferido: el primer clic lo abre y el filtro llega al servidor.
    page.goto(base + '/admin/comunidad', wait_until='networkidle')
    page.get_by_role('combobox', name='Estado', exact=True).press('ArrowDown')
    page.get_by_role('option', name='pendiente', exact=True).click()
    page.get_by_role('button', name='Filtrar', exact=True).click()
    page.wait_for_url(re.compile(r'.*estado=pendiente.*'))
    for ruta, nombre in [('/admin/usuarios', 'usuarios'), ('/admin/consumo', 'consumo'), ('/admin/privacidad', 'privacidad')]:
        page.goto(base + ruta, wait_until='networkidle')
        page.screenshot(path=str(capturas / f'0.50.0-admin-{nombre}-1440-light.png'), full_page=True, animations='disabled')

    # El mensaje real de Mailpit activa la cuenta usando el enlace de Better Auth.
    mensajes = ctx.request.get('http://localhost:8421/api/v1/messages').json()['messages']
    mensaje = next(m for m in mensajes if any(t['Address'] == cuenta['email'] for t in m['To']))
    texto_correo = ctx.request.get('http://localhost:8421/api/v1/message/' + mensaje['ID']).json()['Text']
    enlace = re.search(r'http://localhost:3041/api/auth/verify-email\?\S+', texto_correo).group(0)
    # La verificación puede iniciar sesión como el destinatario: usar otro cookie jar, conservando la sesión admin.
    verificacion_ctx = p.request.new_context()
    verificacion = verificacion_ctx.get(enlace)
    assert verificacion.status < 400
    verificacion_ctx.dispose()
    page.goto(base + '/admin/usuarios/' + cuenta['id'], wait_until='networkidle')
    assert page.get_by_role('navigation', name='Secciones de administración').count() == 1
    assert page.get_by_role('button', name='Reenviar activación', exact=True).count() == 0
    print('Selector diferido, capturas y activación real mediante Mailpit: OK', flush=True)
    ampliacion.verificar_ampliacion(page, base, qa)
    assert not errores, errores
    browser.close()
