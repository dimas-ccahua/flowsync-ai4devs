# FlowSync — atajos de desarrollo.
#
# Requisitos: Node.js + npm, GNU Make y Docker (con el plugin `docker compose`).
#   - macOS:        make viene con las Command Line Tools de Xcode.
#   - Linux / WSL:  sudo apt install make   (o el equivalente de tu distro)
#
# Windows sin WSL no está soportado: estas recetas usan sintaxis POSIX.
# Desde WSL, trabaja sobre el repo clonado dentro del sistema de ficheros
# de Linux (~/...), no en /mnt/c, o npm install irá muy lento.

SHELL := /bin/bash

BACKEND  := backend
FRONTEND := frontend

.DEFAULT_GOAL := help
.PHONY: help setup start install env migrate clean \
        db-up db-down migrate-dev migrate-test test seed

# La ayuda se genera a partir de los comentarios `## ...` de cada target, para
# que no haya un segundo listado que mantener a mano y que pueda divergir.
help: ## Muestra esta ayuda
	@echo "FlowSync — targets disponibles:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*## " }; { printf "  make %-13s %s\n", $$1, $$2 }'
	@echo ""

# ---------------------------------------------------------------------------
# setup
# ---------------------------------------------------------------------------

setup: install env migrate ## Deja el proyecto listo para arrancar
	@echo ""
	@echo "✅ Setup completado. Arranca todo con: make start"

install:
	@command -v node >/dev/null 2>&1 || { echo "❌ Node.js no está instalado."; exit 1; }
	@command -v npm  >/dev/null 2>&1 || { echo "❌ npm no está instalado."; exit 1; }
	@echo "📦 Instalando dependencias del backend..."
	@cd $(BACKEND) && npm install
	@echo "📦 Instalando dependencias del frontend..."
	@cd $(FRONTEND) && npm install

env:
	@if [ ! -f $(BACKEND)/.env ]; then \
		echo "📝 Creando $(BACKEND)/.env desde .env.example..."; \
		cp $(BACKEND)/.env.example $(BACKEND)/.env; \
	else \
		echo "📝 $(BACKEND)/.env ya existe, no se toca."; \
	fi
	@if [ ! -f $(FRONTEND)/.env ]; then \
		echo "📝 Creando $(FRONTEND)/.env desde .env.example..."; \
		cp $(FRONTEND)/.env.example $(FRONTEND)/.env; \
	else \
		echo "📝 $(FRONTEND)/.env ya existe, no se toca."; \
	fi
	@if grep -Eq '^APP_KEY=.+' $(BACKEND)/.env; then \
		echo "🔑 APP_KEY ya definida, no se regenera."; \
	else \
		echo "🔑 Generando APP_KEY..."; \
		cd $(BACKEND) && node ace generate:key; \
	fi

# ---------------------------------------------------------------------------
# bases de datos (compose.yaml: `db` en el 54410, `db-test` en el 54411)
# ---------------------------------------------------------------------------

# `--wait` no devuelve el control hasta que el healthcheck del servicio pasa:
# la imagen, la primera vez, inicializa la base y rechaza conexiones mientras
# tanto. Todo lo que necesita una base la levanta así antes, de forma que
# ningún target depende de que alguien haya hecho `make db-up` primero.
COMPOSE_UP := docker compose up -d --wait

db-up: ## Levanta las dos bases y espera a que estén sanas
	@echo "🐘 Levantando db (54410) y db-test (54411)..."
	@$(COMPOSE_UP) db db-test

db-down: ## Para las dos bases (db conserva su volumen; db-test se pierde)
	@echo "🐘 Parando las bases..."
	@docker compose down

migrate-dev: ## Migra la base de desarrollo (db)
	@$(COMPOSE_UP) db
	@echo "🗃️  Migrando la base de desarrollo..."
	@cd $(BACKEND) && node ace migration:run

# NODE_ENV=test hace que el framework cargue backend/.env.test, que apunta a
# db-test. Es el mismo mecanismo que usa la batería de pruebas.
migrate-test: ## Migra la base de pruebas (db-test)
	@$(COMPOSE_UP) db-test
	@echo "🗃️  Migrando la base de pruebas..."
	@cd $(BACKEND) && NODE_ENV=test node ace migration:run

migrate: migrate-dev migrate-test ## Migra las dos bases

# db-test vive en memoria: tras cada arranque está vacía, así que se migra
# siempre antes de correr la batería (si ya está migrada, no hace nada).
test: migrate-test ## Corre la batería de pruebas del backend contra db-test
	@echo "🧪 Corriendo la batería de pruebas del backend..."
	@cd $(BACKEND) && npm test

# Migra antes porque sembrar una base sin tablas falla, y migrar una ya
# migrada no hace nada. El seeder solo corre con NODE_ENV=development (el de
# backend/.env) y no duplica nada si ya se lanzó.
seed: migrate-dev ## Llena la base de desarrollo con datos inventados
	@echo "🌱 Sembrando la base de desarrollo..."
	@cd $(BACKEND) && node ace db:seed

# ---------------------------------------------------------------------------
# start
# ---------------------------------------------------------------------------

# Lanza los dos servidores en paralelo dentro de la misma receta.
#
# `kill -INT 0` manda un SIGINT a todo el grupo de procesos — exactamente lo
# mismo que hace un Ctrl-C real — y así se lleva por delante ambos servidores y
# sus hijos, sin dejar nodos huérfanos ocupando los puertos. Tiene que ser
# SIGINT y no el SIGTERM por defecto de `kill 0`: con SIGTERM, el wrapper de
# `npm run dev` y el `node ace serve --hmr` sobreviven a la señal y quedan
# colgados. Se dispara desde dos sitios:
#
#   - el trap, cuando llega un Ctrl-C (SIGINT al grupo) o un SIGTERM;
#   - el final de cada subshell, cuando *ese* servidor termina por su cuenta.
#
# Lo segundo es necesario porque `wait` a secas espera a que acaben TODOS los
# jobs: si el backend crashea al arrancar, el frontend seguiría vivo para
# siempre y el usuario no se enteraría. No se usa `wait -n` (que sería lo
# natural) porque llegó en bash 4.3 y macOS trae bash 3.2.
# Ojo: `start` está pensado para uso interactivo, desde una terminal. No lo
# llames desde un script ni desde CI: sin control de trabajos, el grupo de
# procesos incluye al proceso que invocó a make, y el SIGINT se lo llevaría por
# delante a él también. Aislar los servidores en su propio grupo con `set -m`
# no vale: los dejaría en segundo plano y el primer `read` de stdin les
# provocaría un SIGTTIN, colgando el "Press h" de Adonis y los atajos de Vite.
start: ## Levanta backend y frontend a la vez
	@if [ ! -d $(BACKEND)/node_modules ] || [ ! -d $(FRONTEND)/node_modules ]; then \
		echo "❌ Faltan dependencias. Ejecuta primero: make setup"; exit 1; \
	fi
	@if [ ! -f $(BACKEND)/.env ]; then \
		echo "❌ Falta $(BACKEND)/.env. Ejecuta primero: make setup"; exit 1; \
	fi
	@$(COMPOSE_UP) db
	@echo "🚀 Arrancando backend (http://localhost:3333) y frontend (http://localhost:5173)..."
	@echo "   Ctrl-C para parar los dos. Si uno se cae, el otro se cierra también."
	@echo ""
	@trap 'trap - INT TERM EXIT; kill -INT 0' INT TERM EXIT; \
	( cd $(BACKEND)  && npm run dev; \
	  echo ""; echo "⚠️  El backend se ha parado. Cerrando el frontend."; kill -INT 0 ) & \
	( cd $(FRONTEND) && npm run dev; \
	  echo ""; echo "⚠️  El frontend se ha parado. Cerrando el backend."; kill -INT 0 ) & \
	wait

# ---------------------------------------------------------------------------
# clean
# ---------------------------------------------------------------------------

clean: ## Borra node_modules y las bases (incluido el volumen de db)
	@echo "🧹 Limpiando..."
	@rm -rf $(BACKEND)/node_modules $(FRONTEND)/node_modules
	@docker compose down -v
	@echo "✅ Listo. Vuelve a ejecutar: make setup"
