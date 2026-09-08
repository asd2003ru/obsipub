// Package logger предоставляет обёртку над zerolog для структурированного логирования.
package logger

import (
	"os"
	"strings"

	"github.com/rs/zerolog"
)

// TimeFormat формат времени для логов (RFC3339 с миллисекундами).
const TimeFormat = "2006-01-02T15:04:05.000Z"

// Logger интерфейс для логирования.
type Logger interface {
	Info(msg string, args ...any)
	Debug(msg string, args ...any)
	Error(err error, msg string, args ...any)
	Fatal(err error, msg string, args ...any)
}

// zlog реализация логгера на основе zerolog.
type zlog struct {
	zl zerolog.Logger
}

// wrapperCallerSkip добавляет один стек-фрейм обёртки logger к стандартному skip zerolog.
const wrapperCallerSkip = 1

// Fatal логирует фатальную ошибку и завершает программу
func (l *zlog) Fatal(err error, msg string, args ...any) {
	evt := l.zl.Fatal().Caller(wrapperCallerSkip)
	if err != nil {
		evt = evt.Err(err)
	}
	if len(args) == 0 {
		evt.Msg(msg)
	} else {
		evt.Msgf(msg, args...)
	}
}

// Info логирует информационное сообщение
func (l *zlog) Info(msg string, args ...any) {
	evt := l.zl.Info()
	if len(args) == 0 {
		evt.Msg(msg)
	} else {
		evt.Msgf(msg, args...)
	}
}

// Error логирует ошибку
func (l *zlog) Error(err error, msg string, args ...any) {
	evt := l.zl.Error().Caller(wrapperCallerSkip)
	if err != nil {
		evt = evt.Err(err)
	}
	if len(args) == 0 {
		evt.Msg(msg)
	} else {
		evt.Msgf(msg, args...)
	}
}

// Debug логирует отладочное сообщение
func (l *zlog) Debug(msg string, args ...any) {
	evt := l.zl.Debug().Caller(wrapperCallerSkip)
	if len(args) == 0 {
		evt.Msg(msg)
	} else {
		evt.Msgf(msg, args...)
	}
}

// LogType определяет тип форматирования логов
type LogType uint8

const (
	// JSONType — логирование в формате JSON (по умолчанию)
	JSONType LogType = iota
	// TextType — текстовое логирование (для отладки)
	TextType
)

// Level определяет уровни логирования
type Level int8

const (
	InfoLevel Level = Level(zerolog.InfoLevel)
)

// New создаёт новый экземпляр логгера.
// Принимает тип логирования и уровень.
func New(logtype LogType, loglevel Level) Logger {
	if lt := os.Getenv("CLOG_TYPE"); lt != "" && strings.ToLower(lt) == "text" {
		logtype = TextType
	}

	level := zerolog.Level(loglevel)
	if ll := os.Getenv("CLOG_LEVEL"); ll != "" {
		lv, err := zerolog.ParseLevel(ll)
		if err == nil {
			level = lv
		}
	}

	zerolog.TimeFieldFormat = TimeFormat

	var zl zerolog.Logger
	if logtype == TextType {
		zl = zerolog.New(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: TimeFormat}).
			With().
			Timestamp().
			Logger()
	} else {
		zl = zerolog.New(os.Stderr).
			With().
			Timestamp().
			Logger()
	}

	zl = zl.Level(level)

	return &zlog{zl: zl}
}
