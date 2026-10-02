"""Pruebas de filas, papelera y rutas del catálogo con fixtures locales."""
from urllib.parse import parse_qs, quote, urlparse


def verificar_ampliacion(page, base, qa):
    cuenta = qa['cuentas']['papelera']
    filtro = '?q=' + quote(cuenta['email'])
    page.goto(base + '/admin/usuarios' + filtro, wait_until='networkidle')
    selector = page.get_by_role('combobox', name='Rol', exact=True)
    assert selector.bounding_box()['width'] >= 200
    assert selector.locator('svg').count() >= 1
    vistas = page.get_by_role('navigation', name='Estado de usuarios')
    assert vistas.get_by_role('link', name='Activos 1', exact=True).get_attribute('aria-current') == 'page'
    destino = vistas.get_by_role('link', name='Eliminados 0', exact=True).get_attribute('href')
    assert parse_qs(urlparse(destino).query)['q'] == [cuenta['email']]
    selector.click()
    page.get_by_role('option', name='Administrador', exact=True).wait_for()
    page.keyboard.press('Escape')

    def accion(nombre, mensaje, pagina=page):
        pagina.get_by_role('button', name=nombre, exact=True).click()
        dialogo = pagina.get_by_role('dialog', name='Confirmar acción de usuario')
        assert pagina.evaluate('document.activeElement.closest("dialog") !== null')
        assert dialogo.get_by_text(cuenta['email'], exact=True).is_visible()
        # Al volver a abrir no se conserva el resultado de la acción anterior.
        assert dialogo.get_by_role('button', name='Confirmar acción').is_enabled()
        dialogo.get_by_label('Motivo (sin datos privados)').fill('Validación sintética del ciclo de usuarios')
        dialogo.get_by_label('Confirmo la cuenta destinataria y esta acción.').check()
        dialogo.get_by_role('button', name='Confirmar acción').click()
        dialogo.get_by_text(mensaje, exact=False).wait_for()
        assert dialogo.get_by_role('button', name='Confirmar acción').is_disabled()
        dialogo.get_by_role('button', name='Cerrar', exact=True).click()

    # Segundo actor para comprobar el icono de correo sin infringir el cooldown del reenvío de la ficha.
    contexto_correo = page.context.browser.new_context()
    contexto_correo.add_cookies([
        {'name': x.split('=', 1)[0].strip(), 'value': x.split('=', 1)[1], 'url': base}
        for x in qa['cuentas']['admin2']['cookie'].split('; ') if '=' in x
    ])
    pagina_correo = contexto_correo.new_page()
    pagina_correo.goto(base + '/admin/usuarios' + filtro, wait_until='networkidle')
    if pagina_correo.get_by_role('button', name='Entendido', exact=True).is_visible():
        pagina_correo.get_by_role('button', name='Entendido', exact=True).click()
    accion('Reenviar verificación', 'SMTP ha aceptado el correo.', pagina_correo)
    contexto_correo.close()

    accion('Deshabilitar', 'Cambio guardado y auditado.')
    page.get_by_role('button', name='Habilitar', exact=True).wait_for()
    accion('Habilitar', 'Cambio guardado y auditado.')
    accion('Verificar correo', 'Cambio guardado y auditado.')
    verificar = page.get_by_role('button', name='Verificar correo', exact=True)
    assert verificar.is_disabled()
    assert page.get_by_role('button', name='Reenviar verificación', exact=True).is_disabled()
    verificar.focus()
    page.keyboard.press('Shift+Tab')
    page.keyboard.press('Tab')
    descripcion = verificar.get_attribute('aria-describedby')
    ayuda = page.locator(f'[id="{descripcion}"][role="tooltip"]')
    ayuda.wait_for()
    assert ayuda.inner_text() == 'Correo ya verificado'
    accion('Eliminar', 'Cuenta enviada a eliminados.')
    assert page.get_by_role('link', name=cuenta['email'], exact=False).count() == 0
    page.goto(base + '/admin/usuarios' + filtro + '&papelera=si', wait_until='networkidle')
    assert vistas.get_by_role('link', name='Activos 0', exact=True).is_visible()
    assert vistas.get_by_role('link', name='Eliminados 1', exact=True).get_attribute('aria-current') == 'page'
    assert vistas.get_by_role('link', name='Todos 1', exact=True).is_visible()
    assert page.get_by_role('button', name='Eliminar definitivamente', exact=True).is_disabled()
    accion('Restaurar', 'Cuenta restaurada;')
    page.goto(base + '/admin/usuarios' + filtro, wait_until='networkidle')
    page.get_by_role('button', name='Deshabilitar', exact=True).wait_for()
    print('Acciones de fila, selector amplio, verificación directa, papelera y restauración: OK', flush=True)
    verificar_catalogo(page, base)


def verificar_catalogo(page, base):
    page.goto(base + '/admin/componentes', wait_until='networkidle')
    enlaces = page.locator('nav[aria-label="Secciones del catálogo"]:visible a')
    rutas = enlaces.evaluate_all('(ns) => ns.map(n => n.getAttribute("href"))')
    assert len(rutas) == 33 and len(set(rutas)) == 33
    assert all('#' not in ruta for ruta in rutas)
    for ruta in rutas:
        page.goto(base + ruta, wait_until='networkidle')
        assert page.locator('main > h1').inner_text().endswith('· Componentes')
        page.locator('main > section[id]').wait_for()
        assert page.locator('main > section[id]').count() == 1
    page.set_viewport_size({'width': 360, 'height': 1000})
    page.goto(base + '/admin/componentes/selectores', wait_until='networkidle')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    resumen = page.locator('summary', has_text='Elegir sección')
    assert resumen.is_visible()
    assert page.locator('details').filter(has=resumen).get_attribute('open') is None
    resumen.click()
    page.locator('nav[aria-label="Secciones del catálogo"]:visible').get_by_role('link', name='Botones', exact=True).click()
    page.wait_for_url(base + '/admin/componentes/acciones')
    page.set_viewport_size({'width': 1440, 'height': 1000})
    print('33 páginas del catálogo, ejemplos aislados e índice móvil: OK', flush=True)
