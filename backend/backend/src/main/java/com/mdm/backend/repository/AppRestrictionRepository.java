package com.mdm.backend.repository;

import com.mdm.backend.model.AppRestriction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AppRestrictionRepository extends JpaRepository<AppRestriction, Long> {
    List<AppRestriction> findByDeviceId(String deviceId);
}