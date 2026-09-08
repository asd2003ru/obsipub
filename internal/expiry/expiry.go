package expiry

func ComputeExpiresAt(ttlHeader, expiresAtHeader string) (int64, error) {
	t, has, err := ParseHeaders(ttlHeader, expiresAtHeader)
	if err != nil {
		return 0, err
	}
	if !has {
		return 0, nil
	}
	return t.Unix(), nil
}
