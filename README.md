# Nuestra historia

Libro compartido con dos cuentas, fotos y textos. PHP 8.2+, MySQL 5.7+ o MariaDB 10.4+, extensiones PDO MySQL, mbstring y fileinfo.

## Instalar

1. Copia `.env.example` a `.env` y configura la conexión MySQL, una clave privada `APP_SETUP_KEY` y la URL `APP_URL`.
2. Ejecuta `php bin/install.php`. Si falta `.env`, la instalación crea uno con configuración local y una clave aleatoria.
3. El SQL también se puede importar desde `database/schema.sql` usando phpMyAdmin. Conserva los datos existentes al ejecutarlo de nuevo.
4. Para probar en el equipo, ejecuta `php -d upload_max_filesize=10M -d post_max_size=12M -S localhost:8080 -t dist`.
5. Abre el enlace privado que muestra la instalación. Crea los dos usuarios y contraseñas. Tu cuenta lleva azul pastel y la de ella rosado pastel. Ambos pueden cambiar su nombre desde Mi perfil.

## Hosting

Configura `dist/` como raíz pública. `backend/`, `.env`, `media/` y `storage/` quedan fuera de esa raíz. El usuario de PHP necesita permiso de escritura en `storage/`. Usa HTTPS en producción. Las fotos nuevas se guardan en `storage/uploads/`, y sus textos y autores en MySQL. Las fotos y canciones iniciales están en `media/` y se sirven mediante la API después del inicio de sesión.

El formulario Nuevo recuerdo admite texto, foto o ambos. Las imágenes deben ser JPG, PNG o WEBP de hasta 10 MB. Cada autor puede eliminar sus recuerdos. Guarda respaldos tanto de MySQL como de `storage/uploads/`.

## Repositorio

Sube el código y `database/schema.sql`. `.env`, las sesiones y las fotos que se suben desde el sistema están excluidas del repositorio. El enlace anterior de Sites usa otro entorno. Esta versión requiere un hosting con PHP y MySQL.
