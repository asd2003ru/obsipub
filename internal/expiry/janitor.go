package expiry

import (
	"context"
	"sync"
	"time"

	"github.com/asd2003ru/obsipub/internal/logger"
)

type Janitor struct {
	coordinator *Coordinator
	interval    time.Duration
	stop        context.CancelFunc
	wg          sync.WaitGroup
}

func StartJanitor(coordinator *Coordinator, interval time.Duration, logs ...logger.Logger) *Janitor {
	var log logger.Logger
	if len(logs) > 0 {
		log = logs[0]
	}
	ctx, cancel := context.WithCancel(context.Background())
	j := &Janitor{
		coordinator: coordinator,
		interval:    interval,
		stop:        cancel,
	}
	j.wg.Add(1)
	go func() {
		defer j.wg.Done()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				count, err := coordinator.RemoveExpiredBeforeWithCount(time.Now().UTC())
				if err != nil && log != nil {
					log.Error(err, "expired publication cleanup failed")
				} else if log != nil && count > 0 {
					log.Info("expired publications deleted count=%d", count)
				} else if log != nil {
					log.Debug("expired publication cleanup completed count=0")
				}
			case <-ctx.Done():
				return
			}
		}
	}()
	return j
}

func (j *Janitor) Stop() {
	j.stop()
	j.wg.Wait()
}
