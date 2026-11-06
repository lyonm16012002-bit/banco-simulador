
CREATE DATABASE IF NOT EXISTS banco_simulador
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE banco_simulador;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS movimientos;
DROP TABLE IF EXISTS transferencias;
DROP TABLE IF EXISTS cuentas;
DROP TABLE IF EXISTS usuarios;
SET FOREIGN_KEY_CHECKS = 1;

-- USUARIOS: clientes y administradores
CREATE TABLE usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  documento     VARCHAR(20)  NOT NULL UNIQUE,
  nombres       VARCHAR(80)  NOT NULL,
  apellidos     VARCHAR(80)  NOT NULL,
  email         VARCHAR(120) NOT NULL UNIQUE,
  telefono      VARCHAR(20),
  direccion     VARCHAR(150),
  password_hash VARCHAR(255) NOT NULL,          -- bcrypt, nunca texto plano
  rol           ENUM('ADMIN','CLIENTE') NOT NULL DEFAULT 'CLIENTE',
  estado        ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  creado_en     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- CUENTAS: cada cliente tiene una o más cuentas
CREATE TABLE cuentas (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  numero_cuenta VARCHAR(20)  NOT NULL UNIQUE,
  usuario_id    INT NOT NULL,
  tipo          ENUM('AHORROS','CORRIENTE') NOT NULL DEFAULT 'AHORROS',
  saldo         DECIMAL(15,2) NOT NULL DEFAULT 0,
  pin_hash      VARCHAR(255) NOT NULL,          -- PIN del cajero (bcrypt)
  intentos_pin  INT NOT NULL DEFAULT 0,         -- intentos fallidos seguidos en el cajero
  estado        ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
  creado_en     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_saldo_no_negativo CHECK (saldo >= 0),
  CONSTRAINT fk_cuentas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- TRANSFERENCIAS: registro de cada transferencia entre cuentas
CREATE TABLE transferencias (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  cuenta_origen_id   INT NOT NULL,
  cuenta_destino_id  INT NOT NULL,
  monto              DECIMAL(15,2) NOT NULL,
  descripcion        VARCHAR(150),
  fecha              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_monto_transferencia CHECK (monto > 0),
  CONSTRAINT chk_cuentas_distintas CHECK (cuenta_origen_id <> cuenta_destino_id),
  CONSTRAINT fk_transf_origen  FOREIGN KEY (cuenta_origen_id)  REFERENCES cuentas(id),
  CONSTRAINT fk_transf_destino FOREIGN KEY (cuenta_destino_id) REFERENCES cuentas(id)
) ENGINE=InnoDB;

-- MOVIMIENTOS: historial financiero (nunca se elimina desde el sistema)
-- valor: positivo = entra dinero, negativo = sale dinero
CREATE TABLE movimientos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  cuenta_id        INT NOT NULL,
  tipo             ENUM('CONSIGNACION','RETIRO_CAJERO','TRANSFERENCIA_ENVIADA','TRANSFERENCIA_RECIBIDA') NOT NULL,
  descripcion      VARCHAR(150) NOT NULL,
  valor            DECIMAL(15,2) NOT NULL,
  saldo_resultante DECIMAL(15,2) NOT NULL,
  transferencia_id INT NULL,
  fecha            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mov_cuenta FOREIGN KEY (cuenta_id) REFERENCES cuentas(id),
  CONSTRAINT fk_mov_transferencia FOREIGN KEY (transferencia_id) REFERENCES transferencias(id),
  INDEX idx_mov_cuenta_fecha (cuenta_id, fecha)
) ENGINE=InnoDB;

INSERT INTO usuarios (id, documento, nombres, apellidos, email, telefono, direccion, password_hash, rol) VALUES
 (1,'1000000001','Admin','Banco','admin@banco.com','3000000000','Sede principal','$2a$10$pkq4vsbEXmrA8Qxaf4sSXegLgfGCQDI7oe9fzWHBKOktvV.xnhNZ6','ADMIN'),
 (2,'1000000002','Ana','Gómez','ana@correo.com','3101112233','Calle 10 #5-20','$2a$10$WqA/yAZSuxa7HDo7ci49iuV.G3KlIx2yeipPZa7YZhPIRjjrCwoQ6','CLIENTE'),
 (3,'1000000003','Carlos','Ruiz','carlos@correo.com','3204445566','Carrera 7 #12-30','$2a$10$WqA/yAZSuxa7HDo7ci49iuV.G3KlIx2yeipPZa7YZhPIRjjrCwoQ6','CLIENTE'),
 (4,'1000000004','Laura','Mejía','laura@correo.com','3157778899','Avenida 3 #8-15','$2a$10$WqA/yAZSuxa7HDo7ci49iuV.G3KlIx2yeipPZa7YZhPIRjjrCwoQ6','CLIENTE');

INSERT INTO cuentas (id, numero_cuenta, usuario_id, tipo, saldo, pin_hash) VALUES
 (1,'1001000001',2,'AHORROS',   1000000,'$2a$10$DXi9GbNkuE2zLXZslq.2SeRpOe7bqdNeehMEPaIapbVlb0PqC4fQ2'),
 (2,'1001000002',3,'CORRIENTE', 2200000,'$2a$10$a5jJaGAR17CBU0yZFihHMee1OY9objUt/bxRtbNns5B316Kk9Jej6'),
 (3,'1001000003',4,'AHORROS',   1100000,'$2a$10$Y1GUnJt8LJIJx1/u4/KwuuhOQlkbUdCtED077yeh7kM.Gzg0qxhB2');

-- Transferencia inicial: Carlos -> Laura por 300.000
INSERT INTO transferencias (id, cuenta_origen_id, cuenta_destino_id, monto, descripcion, fecha)
VALUES (1, 2, 3, 300000, 'Pago de prueba', '2026-10-05 10:30:00');

-- Movimientos iniciales (coherentes con los saldos finales)
INSERT INTO movimientos (cuenta_id, tipo, descripcion, valor, saldo_resultante, transferencia_id, fecha) VALUES
 (1,'CONSIGNACION','Consignación inicial',1200000,1200000,NULL,'2026-10-01 09:00:00'),
 (1,'RETIRO_CAJERO','Retiro cajero',-200000,1000000,NULL,'2026-10-03 15:20:00'),
 (2,'CONSIGNACION','Consignación inicial',2500000,2500000,NULL,'2026-10-01 09:05:00'),
 (2,'TRANSFERENCIA_ENVIADA','Transferencia a cuenta 1001000003 - Pago de prueba',-300000,2200000,1,'2026-10-05 10:30:00'),
 (3,'CONSIGNACION','Consignación inicial',800000,800000,NULL,'2026-10-01 09:10:00'),
 (3,'TRANSFERENCIA_RECIBIDA','Transferencia de cuenta 1001000002 - Pago de prueba',300000,1100000,1,'2026-10-05 10:30:00');
