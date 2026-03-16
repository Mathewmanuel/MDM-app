package com.mdm.backend.repository;

import com.mdm.backend.model.AppRestriction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AppRestrictionRepository extends JpaRepository<AppRestriction, Long> {
    Optional<AppRestriction> findByPackageName(String packageName);
    boolean existsByPackageName(String packageName);
}