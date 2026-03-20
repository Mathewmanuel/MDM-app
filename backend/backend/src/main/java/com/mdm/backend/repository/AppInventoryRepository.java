package com.mdm.backend.repository;

import com.mdm.backend.model.AppInventory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Repository
public interface AppInventoryRepository extends JpaRepository<AppInventory, Long> {
    List<AppInventory> findByDeviceId(String deviceId);

    @Transactional
    void deleteByDeviceId(String deviceId);
}