# Despliegue en Hostinger

Guia corta para publicar PRETIUM HOGAR en Hostinger.

## 1. Subir archivos

Subir el contenido de la carpeta `web/` al directorio publico del sitio o subdominio.

Ejemplo:

```text
public_html/pretium-hogar/
```

La URL esperada para la app queda asi:

```text
https://pretiumarg.online/pretium-hogar/
```

## 2. Crear base de datos

En Hostinger, crear una base MySQL y guardar estos datos:

```text
DB_HOST
DB_NAME
DB_USER
DB_PASS
```

## 3. Crear config.php

Copiar:

```text
web/api/config.example.php
```

como:

```text
web/api/config.php
```

Completar los datos reales de Hostinger:

```php
const DB_HOST = 'localhost';
const DB_NAME = 'nombre_base_de_datos';
const DB_USER = 'usuario_base_de_datos';
const DB_PASS = 'password_base_de_datos';
```

`web/api/config.php` no se sube a GitHub porque contiene credenciales.

## 4. Ejecutar instalador

Abrir en el navegador:

```text
https://pretiumarg.online/pretium-hogar/setup/install.php
```

Esto crea las tablas y un usuario inicial:

```text
Usuario: admin
Contraseña: Cambiar1234
```

## 5. Primer ingreso

Entrar a:

```text
https://pretiumarg.online/pretium-hogar/
```

Iniciar sesion con el usuario inicial.

Luego, desde configuracion, crear el usuario definitivo.

## 6. Limpieza obligatoria

Despues de instalar:

1. Eliminar `setup/install.php` del servidor.
2. Cambiar la contraseña inicial o crear un usuario nuevo y deshabilitar `admin`.
3. Probar guardar un gasto y recargar la pagina para confirmar sincronizacion.

## 7. Prueba rapida

La prueba minima antes de darlo por publicado:

1. Iniciar sesion.
2. Crear un gasto del hogar.
3. Crear un servicio con vencimiento.
4. Recargar la pagina.
5. Verificar que los datos sigan ahi.
6. Descargar backup desde configuracion.
