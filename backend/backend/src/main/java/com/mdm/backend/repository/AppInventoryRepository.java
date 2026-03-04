package com.mdm.backend.repository;

import com.mdm.backend.model.AppInventory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AppInventoryRepository extends JpaRepository<AppInventory, Long> {
}