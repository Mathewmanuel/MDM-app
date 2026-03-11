package com.mdm.backend.repository;

import com.mdm.backend.model.EnrollmentToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface EnrollmentTokenRepository extends JpaRepository<EnrollmentToken, Long> {
    Optional<EnrollmentToken> findByTokenAndUsedFalse(String token);
}